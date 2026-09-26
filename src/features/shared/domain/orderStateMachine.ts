/**
 * Explicit order state machine. The same table is enforced in Postgres by the
 * `orders_state_machine` trigger — this module mirrors it for tests and UI.
 */
export const ORDER_STATES = [
  "CREATED",
  "RESERVED",
  "PAYMENT_PENDING",
  "PAID",
  "CONFIRMED",
  "CANCELLED",
  "EXPIRED",
  "PAYMENT_FAILED",
] as const;
export type OrderState = (typeof ORDER_STATES)[number];

const TRANSITIONS: Record<OrderState, readonly OrderState[]> = {
  CREATED: ["RESERVED", "PAYMENT_PENDING", "CANCELLED", "EXPIRED"],
  RESERVED: ["PAYMENT_PENDING", "CANCELLED", "EXPIRED"],
  PAYMENT_PENDING: ["PAID", "PAYMENT_FAILED", "EXPIRED", "CANCELLED"],
  PAID: ["CONFIRMED"],
  CONFIRMED: [],
  CANCELLED: [],
  EXPIRED: [],
  PAYMENT_FAILED: [],
};

export function canTransition(from: OrderState, to: OrderState): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

export function isTerminal(state: OrderState): boolean {
  return TRANSITIONS[state].length === 0;
}

export const TICKET_STATES = ["VALID", "CHECKED_IN", "CANCELLED", "EXPIRED"] as const;
export type TicketState = (typeof TICKET_STATES)[number];

export function canTicketTransition(from: TicketState, to: TicketState): boolean {
  if (from === to) return true;
  return from === "VALID" && (to === "CHECKED_IN" || to === "CANCELLED" || to === "EXPIRED");
}
