create extension if not exists pgcrypto with schema extensions;

-- ============ ENUMS ============
create type public.app_role as enum ('admin','staff','customer');
create type public.event_status as enum ('DRAFT','PUBLISHED','CANCELLED');
create type public.reservation_status as enum ('HELD','CONVERTED','EXPIRED','RELEASED');
create type public.order_status as enum ('CREATED','RESERVED','PAYMENT_PENDING','PAID','CONFIRMED','CANCELLED','EXPIRED','PAYMENT_FAILED');
create type public.payment_status as enum ('PENDING','SUCCEEDED','DECLINED','TIMEOUT');
create type public.ticket_status as enum ('VALID','CHECKED_IN','CANCELLED','EXPIRED');

-- ============ ROLES ============
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "read own roles" on public.user_roles for select to authenticated using (auth.uid() = user_id);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create table public.profiles (
  id uuid primary key,
  email text not null,
  display_name text,
  created_at timestamptz not null default now()
);
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "read own profile" on public.profiles for select to authenticated using (auth.uid() = id);
create policy "update own profile" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- ============ EVENTS & INVENTORY ============
create table public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,80}$'),
  name text not null check (char_length(name) between 3 and 120),
  description text not null default '' check (char_length(description) <= 4000),
  venue text not null check (char_length(venue) between 2 and 160),
  city text not null default '' check (char_length(city) <= 80),
  starts_at timestamptz not null,
  status public.event_status not null default 'DRAFT',
  hold_minutes int not null default 10 check (hold_minutes between 1 and 60),
  per_user_limit int not null default 4 check (per_user_limit between 1 and 20),
  high_demand boolean not null default false,
  is_demo_lab boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index events_status_starts_idx on public.events (status, starts_at);
grant select on public.events to anon, authenticated;
grant all on public.events to service_role;
alter table public.events enable row level security;
create policy "public reads published events" on public.events for select to anon, authenticated
  using (status = 'PUBLISHED' and is_demo_lab = false);
create policy "admins read all events" on public.events for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create table public.ticket_types (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  description text not null default '' check (char_length(description) <= 300),
  price_cents int not null check (price_cents between 0 and 10000000),
  total_quantity int not null check (total_quantity between 0 and 1000000),
  available_quantity int not null check (available_quantity >= 0),
  held_quantity int not null default 0 check (held_quantity >= 0),
  sold_quantity int not null default 0 check (sold_quantity >= 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint inventory_balance check (available_quantity + held_quantity + sold_quantity = total_quantity),
  unique (event_id, name)
);
create index ticket_types_event_idx on public.ticket_types (event_id);
grant select on public.ticket_types to anon, authenticated;
grant all on public.ticket_types to service_role;
alter table public.ticket_types enable row level security;
create policy "public reads ticket types of published events" on public.ticket_types for select to anon, authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.status = 'PUBLISHED' and e.is_demo_lab = false));
create policy "admins read all ticket types" on public.ticket_types for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- ============ RESERVATIONS ============
create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  event_id uuid not null references public.events(id) on delete cascade,
  status public.reservation_status not null default 'HELD',
  expires_at timestamptz not null,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 100),
  total_quantity int not null check (total_quantity > 0),
  release_reason text,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
create index reservations_status_expiry_idx on public.reservations (status, expires_at);
create index reservations_user_event_idx on public.reservations (user_id, event_id, status);
grant select on public.reservations to authenticated;
grant all on public.reservations to service_role;
alter table public.reservations enable row level security;
create policy "read own reservations" on public.reservations for select to authenticated using (auth.uid() = user_id);

create table public.reservation_items (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  ticket_type_id uuid not null references public.ticket_types(id) on delete cascade,
  quantity int not null check (quantity between 1 and 20),
  unit_price_cents int not null check (unit_price_cents >= 0),
  unique (reservation_id, ticket_type_id)
);
create index reservation_items_res_idx on public.reservation_items (reservation_id);
grant select on public.reservation_items to authenticated;
grant all on public.reservation_items to service_role;
alter table public.reservation_items enable row level security;
create policy "read own reservation items" on public.reservation_items for select to authenticated
  using (exists (select 1 from public.reservations r where r.id = reservation_id and r.user_id = auth.uid()));

-- ============ ORDERS / PAYMENTS ============
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  reservation_id uuid not null unique references public.reservations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  status public.order_status not null default 'CREATED',
  total_cents int not null check (total_cents >= 0),
  customer_name text not null check (char_length(customer_name) between 2 and 100),
  customer_email text not null check (char_length(customer_email) between 5 and 255),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_user_idx on public.orders (user_id, created_at desc);
create index orders_status_idx on public.orders (status);
grant select on public.orders to authenticated;
grant all on public.orders to service_role;
alter table public.orders enable row level security;
create policy "read own orders" on public.orders for select to authenticated using (auth.uid() = user_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status public.payment_status not null default 'PENDING',
  requested_outcome text not null check (requested_outcome in ('SUCCESS','DECLINED','TIMEOUT')),
  provider_reference text not null unique,
  idempotency_key text not null unique check (char_length(idempotency_key) between 8 and 100),
  amount_cents int not null check (amount_cents >= 0),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index payments_order_idx on public.payments (order_id);
grant select on public.payments to authenticated;
grant all on public.payments to service_role;
alter table public.payments enable row level security;
create policy "read own payments" on public.payments for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));

-- ============ TICKETS ============
create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^TKT-[A-F0-9]{20}$'),
  nonce text not null,
  order_id uuid not null references public.orders(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  ticket_type_id uuid not null references public.ticket_types(id) on delete cascade,
  user_id uuid not null,
  status public.ticket_status not null default 'VALID',
  signature text,
  issued_at timestamptz not null default now(),
  checked_in_at timestamptz,
  checked_in_by uuid
);
create index tickets_event_idx on public.tickets (event_id, status);
create index tickets_order_idx on public.tickets (order_id);
create index tickets_user_event_idx on public.tickets (user_id, event_id);
grant select on public.tickets to authenticated;
grant all on public.tickets to service_role;
alter table public.tickets enable row level security;
create policy "read own tickets" on public.tickets for select to authenticated using (auth.uid() = user_id);

create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null unique references public.tickets(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  staff_id uuid not null,
  created_at timestamptz not null default now()
);
grant select on public.checkins to authenticated;
grant all on public.checkins to service_role;
alter table public.checkins enable row level security;
create policy "staff and admin read checkins" on public.checkins for select to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'staff'));

-- ============ SECURITY / OBSERVABILITY ============
create table public.security_events (
  id bigint generated always as identity primary key,
  user_id uuid,
  event_type text not null,
  severity text not null default 'info' check (severity in ('info','warning','critical')),
  ip_hash text,
  event_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index security_events_type_time_idx on public.security_events (event_type, created_at desc);
create index security_events_time_idx on public.security_events (created_at desc);
create index security_events_user_time_idx on public.security_events (user_id, created_at desc);
grant select on public.security_events to authenticated;
grant all on public.security_events to service_role;
alter table public.security_events enable row level security;
create policy "admins read security events" on public.security_events for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create table public.rate_limit_counters (
  bucket_key text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (bucket_key, window_start)
);
grant all on public.rate_limit_counters to service_role;
alter table public.rate_limit_counters enable row level security;

create table public.rate_limit_events (
  id bigint generated always as identity primary key,
  bucket_key text not null,
  scope text not null,
  limit_value int not null,
  hits int not null,
  created_at timestamptz not null default now()
);
create index rate_limit_events_time_idx on public.rate_limit_events (created_at desc);
grant select on public.rate_limit_events to authenticated;
grant all on public.rate_limit_events to service_role;
alter table public.rate_limit_events enable row level security;
create policy "admins read rate limit events" on public.rate_limit_events for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create table public.idempotency_keys (
  scope text not null,
  user_id uuid not null,
  key text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (scope, user_id, key)
);
grant all on public.idempotency_keys to service_role;
alter table public.idempotency_keys enable row level security;

create table public.outbox_events (
  id bigint generated always as identity primary key,
  aggregate_type text not null,
  aggregate_id uuid,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index outbox_unprocessed_idx on public.outbox_events (processed_at, id);
grant select on public.outbox_events to authenticated;
grant all on public.outbox_events to service_role;
alter table public.outbox_events enable row level security;
create policy "admins read outbox" on public.outbox_events for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- ============ STATE MACHINE TRIGGERS ============
create or replace function public.enforce_order_transition()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = old.status then
    new.updated_at := now();
    return new;
  end if;
  if not (
    (old.status = 'CREATED' and new.status in ('RESERVED','PAYMENT_PENDING','CANCELLED','EXPIRED')) or
    (old.status = 'RESERVED' and new.status in ('PAYMENT_PENDING','CANCELLED','EXPIRED')) or
    (old.status = 'PAYMENT_PENDING' and new.status in ('PAID','PAYMENT_FAILED','EXPIRED','CANCELLED')) or
    (old.status = 'PAID' and new.status = 'CONFIRMED')
  ) then
    raise exception 'INVALID_ORDER_TRANSITION: % -> %', old.status, new.status using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger orders_state_machine before update of status on public.orders
  for each row execute function public.enforce_order_transition();

create or replace function public.enforce_ticket_transition()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = old.status then return new; end if;
  if not (old.status = 'VALID' and new.status in ('CHECKED_IN','CANCELLED','EXPIRED')) then
    raise exception 'INVALID_TICKET_TRANSITION: % -> %', old.status, new.status using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger tickets_state_machine before update of status on public.tickets
  for each row execute function public.enforce_ticket_transition();

-- ============ HELPERS ============
create or replace function public.log_security(p_user uuid, p_type text, p_severity text, p_ip text, p_event uuid, p_meta jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.security_events (user_id, event_type, severity, ip_hash, event_id, metadata)
  values (p_user, left(p_type, 60), coalesce(p_severity, 'info'), left(p_ip, 64), p_event, coalesce(p_meta, '{}'::jsonb));
end $$;

create or replace function public.emit_outbox(p_agg text, p_id uuid, p_type text, p_payload jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.outbox_events (aggregate_type, aggregate_id, event_type, payload) values (p_agg, p_id, p_type, coalesce(p_payload,'{}'::jsonb));
end $$;

create or replace function public.check_rate_limit(p_key text, p_limit int, p_window_seconds int, p_scope text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_window timestamptz; v_hits int;
begin
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.rate_limit_counters (bucket_key, window_start, hits) values (p_key, v_window, 1)
  on conflict (bucket_key, window_start) do update set hits = public.rate_limit_counters.hits + 1
  returning hits into v_hits;
  if v_hits > p_limit then
    insert into public.rate_limit_events (bucket_key, scope, limit_value, hits) values (left(p_key, 120), p_scope, p_limit, v_hits);
    return false;
  end if;
  return true;
end $$;

create or replace function public._release_reservation(p_res uuid, p_status public.reservation_status, p_reason text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v public.reservations; it record;
begin
  update public.reservations set status = p_status, released_at = now(), release_reason = p_reason
    where id = p_res and status = 'HELD' returning * into v;
  if not found then return false; end if;
  for it in select ticket_type_id, quantity from public.reservation_items where reservation_id = p_res order by ticket_type_id loop
    update public.ticket_types set held_quantity = held_quantity - it.quantity, available_quantity = available_quantity + it.quantity
      where id = it.ticket_type_id;
  end loop;
  if p_status = 'EXPIRED' then
    update public.orders set status = 'EXPIRED' where reservation_id = p_res and status in ('CREATED','RESERVED','PAYMENT_PENDING');
    perform public.log_security(v.user_id, 'RESERVATION_EXPIRED', 'info', null, v.event_id, jsonb_build_object('reservation_id', p_res, 'quantity', v.total_quantity));
  elsif p_reason = 'user_cancelled' then
    update public.orders set status = 'CANCELLED' where reservation_id = p_res and status in ('CREATED','RESERVED','PAYMENT_PENDING');
    perform public.log_security(v.user_id, 'RESERVATION_RELEASED', 'info', null, v.event_id, jsonb_build_object('reservation_id', p_res, 'reason', p_reason));
  end if;
  perform public.emit_outbox('reservation', p_res, 'reservation.' || lower(p_status::text), jsonb_build_object('reason', p_reason, 'quantity', v.total_quantity));
  return true;
end $$;

create or replace function public.expire_stale_reservations()
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select id from public.reservations where status = 'HELD' and expires_at < now() order by expires_at for update skip locked loop
    if public._release_reservation(r.id, 'EXPIRED', 'hold_expired') then n := n + 1; end if;
  end loop;
  delete from public.rate_limit_counters where window_start < now() - interval '2 hours';
  return n;
end $$;

-- ============ ATOMIC RESERVATION ============
create or replace function public.reserve_tickets(p_user uuid, p_event uuid, p_items jsonb, p_idempotency_key text, p_ip text, p_meta jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_event public.events;
  v_existing public.reservations;
  v_res_id uuid;
  v_req_total int := 0;
  v_used int := 0;
  v_price int;
  v_total_cents int := 0;
  v_items_count int;
  v_bad int;
  v_attempts int;
  v_user_limit int := 10;
  v_recent_fail int;
  it record;
  v_failed_tt uuid;
  v_expires timestamptz;
begin
  perform public.expire_stale_reservations();

  if p_user is null or p_event is null or p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 100 then
    return jsonb_build_object('success', false, 'code', 'INVALID_REQUEST', 'message', 'Malformed reservation request.');
  end if;

  -- traffic meter for fair-queue signal
  perform public.check_rate_limit('traffic:event:' || p_event::text, 2147483647, 60, 'traffic');
  select coalesce(sum(hits),0) into v_attempts from public.rate_limit_counters
    where bucket_key = 'traffic:event:' || p_event::text and window_start >= now() - interval '60 seconds';
  if v_attempts > 100 then v_user_limit := 5; end if; -- surge mode: tighter per-user throttle

  if not public.check_rate_limit('reserve:user:' || p_user::text, v_user_limit, 60, 'reserve_user') then
    perform public.log_security(p_user, 'RATE_LIMITED', 'warning', p_ip, p_event, jsonb_build_object('scope','reserve_user','limit',v_user_limit) || coalesce(p_meta,'{}'::jsonb));
    return jsonb_build_object('success', false, 'code', 'RATE_LIMITED', 'message', 'Too many reservation attempts. Please wait a minute.');
  end if;
  if p_ip is not null and not public.check_rate_limit('reserve:ip:' || p_ip, 60, 60, 'reserve_ip') then
    perform public.log_security(p_user, 'RATE_LIMITED', 'warning', p_ip, p_event, jsonb_build_object('scope','reserve_ip','limit',60));
    return jsonb_build_object('success', false, 'code', 'RATE_LIMITED', 'message', 'Too many requests from your network. Please slow down.');
  end if;

  -- repeated failed booking detection
  select count(*) into v_recent_fail from public.security_events
    where user_id = p_user and created_at > now() - interval '10 minutes'
      and event_type in ('LIMIT_VIOLATION','OVERSELL_BLOCKED','HONEYPOT_TRIGGERED','BOT_SUSPECTED');
  if v_recent_fail >= 8 then
    perform public.log_security(p_user, 'SUSPICIOUS_ACTIVITY', 'critical', p_ip, p_event, jsonb_build_object('recent_failures', v_recent_fail));
    return jsonb_build_object('success', false, 'code', 'SUSPICIOUS_ACTIVITY', 'message', 'Booking temporarily paused for this account due to repeated failed attempts.');
  end if;

  -- per-user/per-event mutual exclusion (coordination lock; DB remains source of truth)
  perform pg_advisory_xact_lock(hashtextextended(p_user::text || ':' || p_event::text, 0));

  -- idempotency
  select * into v_existing from public.reservations where user_id = p_user and idempotency_key = p_idempotency_key;
  if found then
    perform public.log_security(p_user, 'DUPLICATE_REQUEST', 'warning', p_ip, p_event, jsonb_build_object('reservation_id', v_existing.id));
    return jsonb_build_object('success', true, 'replayed', true, 'code', 'IDEMPOTENT_REPLAY', 'message', 'Duplicate request detected — returning the original reservation.',
      'reservation_id', v_existing.id, 'expires_at', v_existing.expires_at, 'status', v_existing.status);
  end if;

  select * into v_event from public.events where id = p_event;
  if not found or v_event.status <> 'PUBLISHED' then
    return jsonb_build_object('success', false, 'code', 'EVENT_UNAVAILABLE', 'message', 'This event is not open for booking.');
  end if;

  -- validate payload shape
  begin
    select count(*), coalesce(sum(q),0), count(*) filter (where q < 1 or q > 20 or tt is null)
      into v_items_count, v_req_total, v_bad
      from (select x.ticket_type_id as tt, x.quantity as q from jsonb_to_recordset(p_items) as x(ticket_type_id uuid, quantity int)) s;
  exception when others then
    return jsonb_build_object('success', false, 'code', 'INVALID_REQUEST', 'message', 'Invalid ticket selection payload.');
  end;
  if v_items_count < 1 or v_items_count > 10 or v_bad > 0 then
    return jsonb_build_object('success', false, 'code', 'INVALID_QUANTITY', 'message', 'Each ticket quantity must be a whole number between 1 and 20.');
  end if;

  -- purchase limit: active holds + issued tickets
  select coalesce(sum(ri.quantity),0) into v_used from public.reservations r join public.reservation_items ri on ri.reservation_id = r.id
    where r.user_id = p_user and r.event_id = p_event and r.status = 'HELD';
  v_used := v_used + (select count(*) from public.tickets t where t.user_id = p_user and t.event_id = p_event and t.status in ('VALID','CHECKED_IN'));
  if v_used + v_req_total > v_event.per_user_limit then
    perform public.log_security(p_user, 'LIMIT_VIOLATION', 'warning', p_ip, p_event,
      jsonb_build_object('requested', v_req_total, 'already_held_or_owned', v_used, 'limit', v_event.per_user_limit));
    return jsonb_build_object('success', false, 'code', 'TICKET_LIMIT_EXCEEDED',
      'message', format('Purchase limit is %s per person. You already hold or own %s.', v_event.per_user_limit, v_used),
      'limit', v_event.per_user_limit, 'used', v_used);
  end if;

  -- velocity signal (logged, not blocking)
  if (select count(*) from public.reservations where user_id = p_user and created_at > now() - interval '5 minutes') >= 6 then
    perform public.log_security(p_user, 'SUSPICIOUS_VELOCITY', 'warning', p_ip, p_event, '{}'::jsonb);
  end if;

  v_res_id := gen_random_uuid();
  v_expires := now() + make_interval(mins => v_event.hold_minutes);
  begin
    insert into public.reservations (id, user_id, event_id, status, expires_at, idempotency_key, total_quantity)
      values (v_res_id, p_user, p_event, 'HELD', v_expires, p_idempotency_key, v_req_total);
    for it in
      select x.ticket_type_id as tt, sum(x.quantity)::int as q
      from jsonb_to_recordset(p_items) as x(ticket_type_id uuid, quantity int)
      group by x.ticket_type_id order by x.ticket_type_id
    loop
      v_failed_tt := it.tt;
      update public.ticket_types
        set available_quantity = available_quantity - it.q, held_quantity = held_quantity + it.q
        where id = it.tt and event_id = p_event and available_quantity >= it.q
        returning price_cents into v_price;
      if not found then
        raise exception 'SOLD_OUT' using errcode = 'P0001';
      end if;
      insert into public.reservation_items (reservation_id, ticket_type_id, quantity, unit_price_cents) values (v_res_id, it.tt, it.q, v_price);
      v_total_cents := v_total_cents + v_price * it.q;
    end loop;
  exception when others then
    if sqlerrm = 'SOLD_OUT' then
      perform public.log_security(p_user, 'OVERSELL_BLOCKED', 'warning', p_ip, p_event, jsonb_build_object('ticket_type_id', v_failed_tt, 'requested', v_req_total));
      return jsonb_build_object('success', false, 'code', 'SOLD_OUT', 'message', 'Not enough tickets left for your selection.', 'ticket_type_id', v_failed_tt);
    end if;
    perform public.log_security(p_user, 'RESERVATION_REJECTED', 'warning', p_ip, p_event, jsonb_build_object('reason', 'internal'));
    return jsonb_build_object('success', false, 'code', 'RESERVATION_FAILED', 'message', 'We could not reserve these tickets. Nothing was charged; please try again.');
  end;

  perform public.log_security(p_user, 'RESERVATION_CREATED', 'info', p_ip, p_event, jsonb_build_object('reservation_id', v_res_id, 'quantity', v_req_total));
  perform public.emit_outbox('reservation', v_res_id, 'reservation.created', jsonb_build_object('event_id', p_event, 'quantity', v_req_total));
  return jsonb_build_object('success', true, 'replayed', false, 'code', 'RESERVED', 'message', 'Tickets held.',
    'reservation_id', v_res_id, 'expires_at', v_expires, 'total_cents', v_total_cents, 'quantity', v_req_total);
end $$;

create or replace function public.release_reservation(p_user uuid, p_res uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.reservations;
begin
  select * into v from public.reservations where id = p_res for update;
  if not found or v.user_id <> p_user then
    if found then perform public.log_security(p_user, 'IDOR_BLOCKED', 'critical', null, v.event_id, jsonb_build_object('resource','reservation')); end if;
    return jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'Reservation not found.');
  end if;
  if public._release_reservation(p_res, 'RELEASED', 'user_cancelled') then
    return jsonb_build_object('success', true, 'code', 'RELEASED', 'message', 'Tickets released back to inventory.');
  end if;
  return jsonb_build_object('success', false, 'code', 'NOT_ACTIVE', 'message', 'Reservation is no longer active.');
end $$;

-- ============ CHECKOUT & PAYMENT ============
create or replace function public.start_checkout(p_user uuid, p_res uuid, p_name text, p_email text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.reservations; v_order public.orders; v_total int;
begin
  perform public.expire_stale_reservations();
  select * into v from public.reservations where id = p_res for update;
  if not found or v.user_id <> p_user then
    if found then perform public.log_security(p_user, 'IDOR_BLOCKED', 'critical', null, v.event_id, jsonb_build_object('resource','reservation')); end if;
    return jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'Reservation not found.');
  end if;
  select * into v_order from public.orders where reservation_id = p_res;
  if found then
    return jsonb_build_object('success', v_order.status = 'PAYMENT_PENDING', 'code', case when v_order.status = 'PAYMENT_PENDING' then 'IDEMPOTENT_REPLAY' else 'ORDER_' || v_order.status::text end,
      'message', 'Order already exists for this reservation.', 'order_id', v_order.id, 'status', v_order.status);
  end if;
  if v.status <> 'HELD' or v.expires_at < now() then
    return jsonb_build_object('success', false, 'code', 'RESERVATION_EXPIRED', 'message', 'Your hold has expired and the tickets were released.');
  end if;
  select coalesce(sum(quantity * unit_price_cents),0) into v_total from public.reservation_items where reservation_id = p_res;
  insert into public.orders (user_id, reservation_id, event_id, status, total_cents, customer_name, customer_email)
    values (p_user, p_res, v.event_id, 'RESERVED', v_total, p_name, p_email) returning * into v_order;
  update public.orders set status = 'PAYMENT_PENDING' where id = v_order.id;
  perform public.log_security(p_user, 'PAYMENT_STARTED', 'info', null, v.event_id, jsonb_build_object('order_id', v_order.id));
  perform public.emit_outbox('order', v_order.id, 'order.payment_pending', jsonb_build_object('total_cents', v_total));
  return jsonb_build_object('success', true, 'code', 'PAYMENT_PENDING', 'message', 'Order created.', 'order_id', v_order.id, 'total_cents', v_total, 'status', 'PAYMENT_PENDING');
end $$;

create or replace function public.complete_payment(p_user uuid, p_order uuid, p_outcome text, p_payment_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_order public.orders; v_res public.reservations; v_pay public.payments; v_prior public.payments;
  it record; i int; v_tickets jsonb := '[]'::jsonb; v_t public.tickets;
begin
  if p_outcome not in ('SUCCESS','DECLINED','TIMEOUT') or p_payment_key is null or char_length(p_payment_key) not between 8 and 100 then
    return jsonb_build_object('success', false, 'code', 'INVALID_REQUEST', 'message', 'Invalid payment request.');
  end if;

  select * into v_order from public.orders where id = p_order for update;
  if not found or v_order.user_id <> p_user then
    if found then perform public.log_security(p_user, 'IDOR_BLOCKED', 'critical', null, v_order.event_id, jsonb_build_object('resource','order')); end if;
    return jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'Order not found.');
  end if;

  select * into v_prior from public.payments where idempotency_key = p_payment_key;
  if found or v_order.status in ('PAID','CONFIRMED') then
    perform public.log_security(p_user, 'PAYMENT_REPLAY_BLOCKED', 'warning', null, v_order.event_id, jsonb_build_object('order_id', p_order));
    return jsonb_build_object('success', v_order.status = 'CONFIRMED', 'replayed', true, 'code', 'DUPLICATE_PAYMENT_REPLAY',
      'message', 'This payment was already processed. No additional tickets were issued.', 'order_id', p_order, 'status', v_order.status);
  end if;

  if v_order.status <> 'PAYMENT_PENDING' then
    perform public.log_security(p_user, 'INVALID_STATE_TRANSITION', 'warning', null, v_order.event_id, jsonb_build_object('order_id', p_order, 'status', v_order.status));
    return jsonb_build_object('success', false, 'code', 'INVALID_ORDER_STATE', 'message', format('Order is %s and cannot be paid. Start a new booking.', v_order.status), 'status', v_order.status);
  end if;

  select * into v_res from public.reservations where id = v_order.reservation_id for update;
  if v_res.status <> 'HELD' or v_res.expires_at < now() then
    perform public._release_reservation(v_res.id, 'EXPIRED', 'hold_expired');
    update public.orders set status = 'EXPIRED' where id = p_order and status = 'PAYMENT_PENDING';
    return jsonb_build_object('success', false, 'code', 'RESERVATION_EXPIRED', 'message', 'Your hold expired before payment. Tickets were released; nothing was charged.');
  end if;

  insert into public.payments (order_id, status, requested_outcome, provider_reference, idempotency_key, amount_cents)
    values (p_order, 'PENDING', p_outcome, 'mock_' || encode(extensions.gen_random_bytes(10), 'hex'), p_payment_key, v_order.total_cents)
    returning * into v_pay;

  if p_outcome = 'SUCCESS' then
    update public.payments set status = 'SUCCEEDED', completed_at = now() where id = v_pay.id;
    update public.orders set status = 'PAID' where id = p_order;
    update public.reservations set status = 'CONVERTED', released_at = now(), release_reason = 'paid' where id = v_res.id;
    for it in select ri.ticket_type_id, ri.quantity from public.reservation_items ri where ri.reservation_id = v_res.id order by ri.ticket_type_id loop
      update public.ticket_types set held_quantity = held_quantity - it.quantity, sold_quantity = sold_quantity + it.quantity where id = it.ticket_type_id;
      for i in 1..it.quantity loop
        insert into public.tickets (code, nonce, order_id, event_id, ticket_type_id, user_id)
          values ('TKT-' || upper(encode(extensions.gen_random_bytes(10), 'hex')), encode(extensions.gen_random_bytes(12), 'hex'), p_order, v_order.event_id, it.ticket_type_id, p_user)
          returning * into v_t;
        v_tickets := v_tickets || jsonb_build_object('id', v_t.id, 'code', v_t.code, 'nonce', v_t.nonce, 'event_id', v_t.event_id, 'order_id', v_t.order_id, 'issued_at', v_t.issued_at);
      end loop;
    end loop;
    update public.orders set status = 'CONFIRMED' where id = p_order;
    perform public.log_security(p_user, 'PAYMENT_COMPLETED', 'info', null, v_order.event_id, jsonb_build_object('order_id', p_order));
    perform public.log_security(p_user, 'TICKET_ISSUED', 'info', null, v_order.event_id, jsonb_build_object('order_id', p_order, 'count', jsonb_array_length(v_tickets)));
    perform public.emit_outbox('order', p_order, 'order.confirmed', jsonb_build_object('tickets', jsonb_array_length(v_tickets)));
    return jsonb_build_object('success', true, 'code', 'CONFIRMED', 'message', 'Payment confirmed. Tickets issued.', 'order_id', p_order, 'status', 'CONFIRMED', 'tickets', v_tickets);
  end if;

  update public.payments set status = p_outcome::public.payment_status, completed_at = now() where id = v_pay.id;
  update public.orders set status = 'PAYMENT_FAILED' where id = p_order;
  perform public._release_reservation(v_res.id, 'RELEASED', 'payment_' || lower(p_outcome));
  perform public.log_security(p_user, 'PAYMENT_FAILED', 'warning', null, v_order.event_id, jsonb_build_object('order_id', p_order, 'outcome', p_outcome));
  perform public.log_security(p_user, 'COMPENSATION_EXECUTED', 'info', null, v_order.event_id, jsonb_build_object('order_id', p_order, 'released_quantity', v_res.total_quantity));
  perform public.emit_outbox('order', p_order, 'order.payment_failed', jsonb_build_object('outcome', p_outcome, 'compensated', true));
  return jsonb_build_object('success', false, 'code', case when p_outcome = 'DECLINED' then 'PAYMENT_DECLINED' else 'PAYMENT_TIMEOUT' end,
    'message', case when p_outcome = 'DECLINED' then 'Payment was declined. Your hold was released and inventory returned — you were not charged.'
                    else 'Payment timed out. Your hold was released and inventory returned — you were not charged.' end,
    'compensated', true, 'order_id', p_order, 'status', 'PAYMENT_FAILED');
end $$;

create or replace function public.set_ticket_signature(p_ticket uuid, p_signature text)
returns void language sql security definer set search_path = public as $$
  update public.tickets set signature = p_signature where id = p_ticket and signature is null;
$$;

-- ============ VALIDATION / CHECK-IN ============
create or replace function public.inspect_ticket(p_code text, p_event uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.tickets; v_tt text; v_ev text;
begin
  select * into v from public.tickets where code = p_code;
  if not found then return jsonb_build_object('result', 'INVALID', 'message', 'Ticket does not exist.'); end if;
  select name into v_tt from public.ticket_types where id = v.ticket_type_id;
  select name into v_ev from public.events where id = v.event_id;
  if v.event_id <> p_event then
    return jsonb_build_object('result', 'WRONG_EVENT', 'message', 'Ticket belongs to a different event.', 'ticket_event', v_ev);
  end if;
  if v.status = 'CHECKED_IN' then
    return jsonb_build_object('result', 'ALREADY_USED', 'message', 'Ticket already checked in.', 'checked_in_at', v.checked_in_at, 'ticket_type', v_tt, 'event', v_ev);
  end if;
  if v.status <> 'VALID' then
    return jsonb_build_object('result', v.status::text, 'message', 'Ticket is not valid for entry.', 'ticket_type', v_tt, 'event', v_ev);
  end if;
  return jsonb_build_object('result', 'VALID', 'message', 'Valid ticket.', 'ticket_type', v_tt, 'event', v_ev, 'issued_at', v.issued_at, 'nonce', v.nonce, 'order_id', v.order_id);
end $$;

create or replace function public.check_in_ticket(p_staff uuid, p_code text, p_event uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.tickets; v_insp jsonb;
begin
  update public.tickets set status = 'CHECKED_IN', checked_in_at = now(), checked_in_by = p_staff
    where code = p_code and event_id = p_event and status = 'VALID' returning * into v;
  if found then
    insert into public.checkins (ticket_id, event_id, staff_id) values (v.id, v.event_id, p_staff);
    perform public.log_security(p_staff, 'TICKET_CHECKED_IN', 'info', null, p_event, jsonb_build_object('ticket_id', v.id));
    perform public.emit_outbox('ticket', v.id, 'ticket.checked_in', '{}'::jsonb);
    return jsonb_build_object('result', 'CHECKED_IN', 'message', 'Checked in.', 'checked_in_at', v.checked_in_at);
  end if;
  v_insp := public.inspect_ticket(p_code, p_event);
  if v_insp->>'result' = 'ALREADY_USED' then
    perform public.log_security(p_staff, 'TICKET_REPLAY_BLOCKED', 'warning', null, p_event, jsonb_build_object('code_suffix', right(p_code, 4)));
  else
    perform public.log_security(p_staff, 'TICKET_VALIDATION_FAILED', 'warning', null, p_event, jsonb_build_object('result', v_insp->>'result'));
  end if;
  return v_insp;
end $$;

-- ============ USERS / ADMIN / DEMO ============
create or replace function public.ensure_profile(p_user uuid, p_email text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_roles jsonb;
begin
  insert into public.profiles (id, email) values (p_user, p_email) on conflict (id) do nothing;
  if not exists (select 1 from public.user_roles where user_id = p_user) then
    insert into public.user_roles (user_id, role) values (p_user, 'customer');
  end if;
  select coalesce(jsonb_agg(role), '[]'::jsonb) into v_roles from public.user_roles where user_id = p_user;
  return v_roles;
end $$;

create or replace function public.grant_role(p_user uuid, p_role public.app_role)
returns void language sql security definer set search_path = public as $$
  insert into public.user_roles (user_id, role) values (p_user, p_role) on conflict do nothing;
$$;

create or replace function public.user_event_usage(p_user uuid, p_event uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_held int; v_owned int;
begin
  perform public.expire_stale_reservations();
  select coalesce(sum(ri.quantity),0) into v_held from public.reservations r join public.reservation_items ri on ri.reservation_id = r.id
    where r.user_id = p_user and r.event_id = p_event and r.status = 'HELD';
  select count(*) into v_owned from public.tickets where user_id = p_user and event_id = p_event and status in ('VALID','CHECKED_IN');
  return jsonb_build_object('held', v_held, 'owned', v_owned);
end $$;

create or replace function public.get_traffic_status(p_event uuid)
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object('attempts_last_minute', coalesce(sum(hits),0),
    'level', case when coalesce(sum(hits),0) > 100 then 'SURGE' when coalesce(sum(hits),0) > 25 then 'ELEVATED' else 'NORMAL' end)
  from public.rate_limit_counters where bucket_key = 'traffic:event:' || p_event::text and window_start >= now() - interval '60 seconds';
$$;

create or replace function public.admin_stats()
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'total_events', (select count(*) from public.events where not is_demo_lab),
    'total_tickets', (select coalesce(sum(total_quantity),0) from public.ticket_types tt join public.events e on e.id = tt.event_id where not e.is_demo_lab),
    'sold_tickets', (select coalesce(sum(sold_quantity),0) from public.ticket_types tt join public.events e on e.id = tt.event_id where not e.is_demo_lab),
    'held_tickets', (select coalesce(sum(held_quantity),0) from public.ticket_types tt join public.events e on e.id = tt.event_id where not e.is_demo_lab),
    'available_tickets', (select coalesce(sum(available_quantity),0) from public.ticket_types tt join public.events e on e.id = tt.event_id where not e.is_demo_lab),
    'active_reservations', (select count(*) from public.reservations where status = 'HELD'),
    'expired_reservations', (select count(*) from public.reservations where status = 'EXPIRED'),
    'successful_orders', (select count(*) from public.orders where status = 'CONFIRMED'),
    'failed_payments', (select count(*) from public.payments where status in ('DECLINED','TIMEOUT')),
    'checkins', (select count(*) from public.checkins),
    'rate_limited', (select count(*) from public.rate_limit_events),
    'security', (select coalesce(jsonb_object_agg(event_type, n), '{}'::jsonb) from (select event_type, count(*) n from public.security_events group by event_type) s)
  );
$$;

create or replace function public.admin_upsert_ticket_type(p_event uuid, p_id uuid, p_name text, p_description text, p_price int, p_total int, p_sort int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.ticket_types;
begin
  if p_id is null then
    insert into public.ticket_types (event_id, name, description, price_cents, total_quantity, available_quantity, sort_order)
      values (p_event, p_name, coalesce(p_description,''), p_price, p_total, p_total, coalesce(p_sort,0)) returning * into v;
    return jsonb_build_object('success', true, 'id', v.id);
  end if;
  select * into v from public.ticket_types where id = p_id and event_id = p_event for update;
  if not found then return jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'Ticket type not found.'); end if;
  if p_total < v.held_quantity + v.sold_quantity then
    return jsonb_build_object('success', false, 'code', 'INVENTORY_CONFLICT', 'message', format('Total cannot be below %s (held + sold).', v.held_quantity + v.sold_quantity));
  end if;
  update public.ticket_types set name = p_name, description = coalesce(p_description,''), price_cents = p_price,
    total_quantity = p_total, available_quantity = p_total - held_quantity - sold_quantity, sort_order = coalesce(p_sort, sort_order)
    where id = p_id;
  return jsonb_build_object('success', true, 'id', p_id);
end $$;

create or replace function public.demo_reset_lab(p_quantity int, p_limit int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_event uuid; v_tt uuid;
begin
  select id into v_event from public.events where slug = 'concurrency-lab';
  if v_event is null then
    insert into public.events (slug, name, description, venue, city, starts_at, status, hold_minutes, per_user_limit, is_demo_lab, high_demand)
      values ('concurrency-lab', 'Concurrency Lab (sandbox)', 'Isolated sandbox event used by the evaluator demo. Runs the exact production reservation functions.',
              'Virtual', 'Sandbox', now() + interval '30 days', 'PUBLISHED', 10, p_limit, true, true) returning id into v_event;
  end if;
  update public.events set per_user_limit = p_limit, status = 'PUBLISHED' where id = v_event;
  delete from public.tickets where event_id = v_event;
  delete from public.orders where event_id = v_event;
  delete from public.reservations where event_id = v_event;
  select id into v_tt from public.ticket_types where event_id = v_event and name = 'Lab GA';
  if v_tt is null then
    insert into public.ticket_types (event_id, name, price_cents, total_quantity, available_quantity) values (v_event, 'Lab GA', 5000, p_quantity, p_quantity) returning id into v_tt;
  else
    update public.ticket_types set total_quantity = p_quantity, available_quantity = p_quantity, held_quantity = 0, sold_quantity = 0 where id = v_tt;
  end if;
  return jsonb_build_object('event_id', v_event, 'ticket_type_id', v_tt);
end $$;

create or replace function public.demo_force_expire(p_res uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.reservations r set expires_at = now() - interval '1 second'
    from public.events e where r.id = p_res and e.id = r.event_id and e.is_demo_lab and r.status = 'HELD';
  n := public.expire_stale_reservations();
  return jsonb_build_object('expired', n);
end $$;

-- lock down execution: only the trusted server (service_role) may invoke mutating functions
do $$
declare f text;
begin
  foreach f in array array[
    'log_security(uuid,text,text,text,uuid,jsonb)', 'emit_outbox(text,uuid,text,jsonb)', 'check_rate_limit(text,int,int,text)',
    '_release_reservation(uuid,public.reservation_status,text)', 'expire_stale_reservations()',
    'reserve_tickets(uuid,uuid,jsonb,text,text,jsonb)', 'release_reservation(uuid,uuid)', 'start_checkout(uuid,uuid,text,text)',
    'complete_payment(uuid,uuid,text,text)', 'set_ticket_signature(uuid,text)', 'inspect_ticket(text,uuid)', 'check_in_ticket(uuid,text,uuid)',
    'ensure_profile(uuid,text)', 'grant_role(uuid,public.app_role)', 'user_event_usage(uuid,uuid)', 'admin_stats()',
    'admin_upsert_ticket_type(uuid,uuid,text,text,int,int,int)', 'demo_reset_lab(int,int)', 'demo_force_expire(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
revoke all on function public.get_traffic_status(uuid) from public;
grant execute on function public.get_traffic_status(uuid) to anon, authenticated, service_role;

-- ============ REALTIME ============
alter publication supabase_realtime add table public.ticket_types;

-- ============ SEED ============
insert into public.events (id, slug, name, description, venue, city, starts_at, status, hold_minutes, per_user_limit, high_demand) values
('11111111-1111-4111-8111-111111111111', 'tech-summit-2026', 'Tech Summit 2026',
 'Two days of keynotes on distributed systems, applied AI and platform security. Includes hands-on labs and a founder track.',
 'Moscone West, Hall B', 'San Francisco', '2026-11-18 09:00:00+00', 'PUBLISHED', 10, 4, false),
('22222222-2222-4222-8222-222222222222', 'music-festival-2026', 'Music Festival 2026',
 'Three stages, forty artists and a sunset headliner set. The highest-demand drop of the season — expect heavy traffic at on-sale.',
 'Riverside Park Grounds', 'Austin', '2026-12-05 16:00:00+00', 'PUBLISHED', 10, 4, true),
('33333333-3333-4333-8333-333333333333', 'startup-expo-2026', 'Startup Expo 2026',
 'Meet 200+ early-stage companies, investor office hours and a live pitch final.',
 'Javits Center, Level 3', 'New York', '2027-02-11 10:00:00+00', 'PUBLISHED', 10, 6, false);

insert into public.ticket_types (event_id, name, description, price_cents, total_quantity, available_quantity, sort_order) values
('11111111-1111-4111-8111-111111111111', 'VIP', 'Front rows, speaker dinner, lounge access', 89900, 40, 40, 1),
('11111111-1111-4111-8111-111111111111', 'Premium', 'Reserved seating and workshop access', 49900, 150, 150, 2),
('11111111-1111-4111-8111-111111111111', 'General', 'All keynotes and expo floor', 19900, 600, 600, 3),
('22222222-2222-4222-8222-222222222222', 'VIP', 'Stage-side deck, private bar', 34900, 12, 12, 1),
('22222222-2222-4222-8222-222222222222', 'Premium', 'Fast-lane entry and shaded viewing area', 18900, 60, 60, 2),
('22222222-2222-4222-8222-222222222222', 'General', 'Festival grounds access', 8900, 300, 300, 3),
('33333333-3333-4333-8333-333333333333', 'Investor', 'Office hours and pitch-final seating', 29900, 50, 50, 1),
('33333333-3333-4333-8333-333333333333', 'General', 'Expo floor and talks', 4900, 800, 800, 2);