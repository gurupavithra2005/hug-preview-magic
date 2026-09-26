export function remainingMs(expiresAt: string | Date, now: number = Date.now()): number {
  const t = typeof expiresAt === "string" ? Date.parse(expiresAt) : expiresAt.getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, t - now);
}

export function isExpired(expiresAt: string | Date, now: number = Date.now()): boolean {
  return remainingMs(expiresAt, now) === 0;
}

/** "09:42" style countdown. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Client-generated idempotency key. Repeats of the same key never create a second hold. */
export function newIdempotencyKey(prefix = "rsv"): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${rand}`;
}
