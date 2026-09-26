export const MAX_QUANTITY_PER_LINE = 20;

export interface UsageSnapshot {
  limit: number;
  held: number;
  owned: number;
}

/** Tickets a user may still add. Active holds AND purchased tickets both count. */
export function remainingAllowance({ limit, held, owned }: UsageSnapshot): number {
  return Math.max(0, limit - held - owned);
}

export function exceedsLimit(usage: UsageSnapshot, requested: number): boolean {
  return requested > remainingAllowance(usage);
}

/** Clamp a stepper value to what is both available and allowed (UI convenience only — server re-checks). */
export function clampQuantity(desired: number, available: number, allowanceLeft: number): number {
  if (!Number.isFinite(desired)) return 0;
  const max = Math.min(MAX_QUANTITY_PER_LINE, Math.max(0, available), Math.max(0, allowanceLeft));
  return Math.min(Math.max(0, Math.trunc(desired)), max);
}
