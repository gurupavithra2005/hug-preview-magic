export interface PricedLine {
  priceCents: number;
  quantity: number;
}

export interface Totals {
  quantity: number;
  subtotalCents: number;
  totalCents: number;
}

/** Integer-cent arithmetic only — never floats for money. Mirrors the DB total. */
export function computeTotals(lines: PricedLine[]): Totals {
  let quantity = 0;
  let subtotalCents = 0;
  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 0) throw new Error("Invalid quantity");
    if (!Number.isInteger(line.priceCents) || line.priceCents < 0) throw new Error("Invalid price");
    quantity += line.quantity;
    subtotalCents += line.priceCents * line.quantity;
  }
  return { quantity, subtotalCents, totalCents: subtotalCents };
}

export function formatMoney(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}
