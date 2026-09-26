/**
 * Booking service. The single implementation of reserve → checkout → pay →
 * issue → validate used by BOTH the real UI flow and the evaluator demo lab.
 * All inventory mutations happen inside Postgres functions (atomic, row-locked).
 */
import type { AdminClient } from "./context.server";
import { logSecurity } from "./context.server";
import type { ApiResponse } from "@/features/shared/domain/errors";
import { fail } from "@/features/shared/domain/errors";
import {
  computeTicketSignature,
  formatTicketToken,
  parseTicketToken,
  safeEqual,
} from "@/features/shared/domain/ticketToken";

function asResponse(data: unknown, error: { message: string } | null): ApiResponse {
  if (error || !data || typeof data !== "object") {
    console.error("[booking] rpc failure", error?.message);
    return fail("SERVER_ERROR", "The booking service is temporarily unavailable.");
  }
  return data as ApiResponse;
}

function signingSecret(): string {
  const s = process.env["TICKET_SIGNING_SECRET"];
  if (!s) throw new Error("TICKET_SIGNING_SECRET missing");
  return s;
}

export interface ReserveCommand {
  userId: string;
  eventId: string;
  items: { ticketTypeId: string; quantity: number }[];
  idempotencyKey: string;
  ipHash: string | null;
  meta?: Record<string, unknown>;
}

export async function reserveCore(admin: AdminClient, cmd: ReserveCommand): Promise<ApiResponse> {
  const { data, error } = await admin.rpc("reserve_tickets", {
    p_user: cmd.userId,
    p_event: cmd.eventId,
    p_items: cmd.items.map((i) => ({ ticket_type_id: i.ticketTypeId, quantity: i.quantity })) as never,
    p_idempotency_key: cmd.idempotencyKey,
    p_ip: cmd.ipHash as string,
    p_meta: (cmd.meta ?? {}) as never,
  });
  return asResponse(data, error);
}

export async function releaseCore(admin: AdminClient, userId: string, reservationId: string) {
  const { data, error } = await admin.rpc("release_reservation", { p_user: userId, p_res: reservationId });
  return asResponse(data, error);
}

export async function checkoutCore(
  admin: AdminClient,
  userId: string,
  reservationId: string,
  name: string,
  email: string,
) {
  const { data, error } = await admin.rpc("start_checkout", {
    p_user: userId,
    p_res: reservationId,
    p_name: name,
    p_email: email,
  });
  return asResponse(data, error);
}

interface IssuedTicket {
  id: string;
  code: string;
  nonce: string;
  event_id: string;
  order_id: string;
  issued_at: string;
}

export async function signTicket(t: {
  code: string;
  event_id: string;
  order_id: string;
  nonce: string;
  issued_at: string;
}): Promise<string> {
  const sig = await computeTicketSignature(
    { code: t.code, eventId: t.event_id, orderId: t.order_id, nonce: t.nonce, issuedAt: t.issued_at },
    signingSecret(),
  );
  return formatTicketToken(t.code, sig);
}

export async function payCore(
  admin: AdminClient,
  userId: string,
  orderId: string,
  outcome: "SUCCESS" | "DECLINED" | "TIMEOUT",
  paymentKey: string,
  opts: { simulateLatency?: boolean } = {},
): Promise<ApiResponse> {
  // Mock gateway: TIMEOUT simulates a gateway that never answers in time.
  if (outcome === "TIMEOUT" && opts.simulateLatency) await new Promise((r) => setTimeout(r, 2500));
  const { data, error } = await admin.rpc("complete_payment", {
    p_user: userId,
    p_order: orderId,
    p_outcome: outcome,
    p_payment_key: paymentKey,
  });
  const res = asResponse(data, error);
  if (res.success && Array.isArray(res["tickets"])) {
    const tickets = res["tickets"] as IssuedTicket[];
    await Promise.all(
      tickets.map(async (t) => {
        const token = await signTicket(t);
        await admin.rpc("set_ticket_signature", { p_ticket: t.id, p_signature: token.split(".")[1]! });
      }),
    );
    res["tickets"] = tickets.map((t) => ({ id: t.id, code: t.code }));
  }
  return res;
}

export type ValidationResult =
  | "VALID"
  | "CHECKED_IN"
  | "ALREADY_USED"
  | "WRONG_EVENT"
  | "INVALID"
  | "TAMPERED"
  | "CANCELLED"
  | "EXPIRED"
  | "MALFORMED";

export interface ValidationResponse {
  result: ValidationResult;
  message: string;
  checks: { label: string; pass: boolean | null }[];
  ticketType?: string | undefined;
  event?: string | undefined;
  checkedInAt?: string | undefined;
}

export async function validateCore(
  admin: AdminClient,
  staffId: string,
  rawToken: string,
  eventId: string,
  checkIn: boolean,
): Promise<ValidationResponse> {
  const checks: ValidationResponse["checks"] = [
    { label: "Format", pass: null },
    { label: "Ticket exists", pass: null },
    { label: "Signature authentic", pass: null },
    { label: "Correct event", pass: null },
    { label: "Status valid / not reused", pass: null },
  ];
  const parsed = parseTicketToken(rawToken);
  if (!parsed) {
    checks[0]!.pass = false;
    await logSecurity(admin, { userId: staffId, type: "TICKET_VALIDATION_FAILED", severity: "warning", eventId, meta: { reason: "malformed" } });
    return { result: "MALFORMED", message: "Not a valid ticket token format.", checks };
  }
  checks[0]!.pass = true;

  const { data: t } = await admin
    .from("tickets")
    .select("code, event_id, order_id, nonce, issued_at")
    .eq("code", parsed.code)
    .maybeSingle();
  if (!t) {
    checks[1]!.pass = false;
    await logSecurity(admin, { userId: staffId, type: "TICKET_VALIDATION_FAILED", severity: "warning", eventId, meta: { reason: "not_found" } });
    return { result: "INVALID", message: "Ticket does not exist.", checks };
  }
  checks[1]!.pass = true;

  const expected = (await signTicket(t)).split(".")[1]!;
  if (!safeEqual(expected, parsed.signature)) {
    checks[2]!.pass = false;
    await logSecurity(admin, { userId: staffId, type: "TICKET_TAMPERED", severity: "critical", eventId, meta: { code_suffix: parsed.code.slice(-4) } });
    return { result: "TAMPERED", message: "Signature mismatch — this ticket was forged or modified.", checks };
  }
  checks[2]!.pass = true;

  const rpc = checkIn
    ? admin.rpc("check_in_ticket", { p_staff: staffId, p_code: parsed.code, p_event: eventId })
    : admin.rpc("inspect_ticket", { p_code: parsed.code, p_event: eventId });
  const { data, error } = await rpc;
  if (error || !data) return { result: "INVALID", message: "Validation service unavailable.", checks };
  const r = data as Record<string, string>;
  const result = r["result"] as ValidationResult;
  checks[3]!.pass = result !== "WRONG_EVENT";
  checks[4]!.pass = result === "VALID" || result === "CHECKED_IN" ? true : result === "WRONG_EVENT" ? null : false;
  return {
    result,
    message: r["message"] ?? "",
    checks,
    ticketType: r["ticket_type"],
    event: r["event"] ?? r["ticket_event"],
    checkedInAt: r["checked_in_at"],
  };
}
