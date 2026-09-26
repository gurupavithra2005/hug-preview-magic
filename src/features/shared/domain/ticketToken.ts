/**
 * Tamper-resistant ticket tokens.
 *
 * Token = `TKT-<20 hex random>.<22 char base64url HMAC-SHA256>`
 * The HMAC covers code | eventId | orderId | nonce | issuedAt, keyed with a
 * server-only secret. The QR holds only this token — no personal data.
 */
export interface TicketSigningFields {
  code: string;
  eventId: string;
  orderId: string;
  nonce: string;
  issuedAt: string;
}

export const TICKET_CODE_RE = /^TKT-[A-F0-9]{20}$/;
export const TICKET_TOKEN_RE = /^(TKT-[A-F0-9]{20})\.([A-Za-z0-9_-]{22})$/;
const SIG_LENGTH = 22; // 132 bits of the 256-bit MAC

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function canonicalPayload(f: TicketSigningFields): string {
  const issued = new Date(f.issuedAt).toISOString();
  return ["v1", f.code, f.eventId, f.orderId, f.nonce, issued].join("|");
}

export async function computeTicketSignature(f: TicketSigningFields, secret: string): Promise<string> {
  if (!secret || secret.length < 16) throw new Error("Ticket signing secret is not configured");
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(canonicalPayload(f))));
  return toBase64Url(mac).slice(0, SIG_LENGTH);
}

export function formatTicketToken(code: string, signature: string): string {
  return `${code}.${signature}`;
}

export function parseTicketToken(raw: string): { code: string; signature: string } | null {
  const cleaned = raw.trim().replace(/\s+/g, "");
  const m = TICKET_TOKEN_RE.exec(cleaned);
  if (!m) return null;
  return { code: m[1]!, signature: m[2]! };
}

/** Constant-time string comparison to avoid timing oracles. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyTicketSignature(
  f: TicketSigningFields,
  signature: string,
  secret: string,
): Promise<boolean> {
  const expected = await computeTicketSignature(f, secret);
  return safeEqual(expected, signature);
}
