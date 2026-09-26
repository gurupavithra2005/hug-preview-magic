import { getRequestHeader } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { isRole, type Role } from "@/features/shared/domain/roles";

export type AdminClient = SupabaseClient<Database>;

export async function getAdmin(): Promise<AdminClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Salted SHA-256 of the client IP — raw IPs are never stored or logged. */
export async function clientIpHash(): Promise<string | null> {
  const raw =
    getRequestHeader("cf-connecting-ip") ??
    getRequestHeader("x-real-ip") ??
    getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ??
    null;
  if (!raw) return null;
  const salt = process.env["IP_HASH_SALT"] ?? "demo-salt";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${raw}`));
  return Array.from(new Uint8Array(digest).slice(0, 12))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function userAgent(): string | null {
  return getRequestHeader("user-agent") ?? null;
}

/** Reads the caller's roles through RLS (a user can only see their own role rows). */
export async function getRoles(supabase: SupabaseClient<Database>, userId: string): Promise<Role[]> {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) return [];
  return (data ?? []).map((r) => r.role).filter(isRole);
}

export async function hasAnyRole(
  supabase: SupabaseClient<Database>,
  userId: string,
  allowed: readonly Role[],
): Promise<boolean> {
  const roles = await getRoles(supabase, userId);
  return roles.some((r) => allowed.includes(r));
}

export async function logSecurity(
  admin: AdminClient,
  e: { userId: string | null; type: string; severity?: "info" | "warning" | "critical"; ip?: string | null; eventId?: string | null; meta?: Record<string, unknown> },
): Promise<void> {
  await admin.rpc("log_security", {
    p_user: e.userId as string,
    p_type: e.type,
    p_severity: e.severity ?? "info",
    p_ip: (e.ip ?? null) as string,
    p_event: (e.eventId ?? null) as string,
    p_meta: (e.meta ?? {}) as never,
  });
}
