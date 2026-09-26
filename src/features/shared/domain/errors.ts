/**
 * Structured API contract shared by every server function.
 * Never leaks stack traces — only a stable machine code + human message.
 */
export type ErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_QUANTITY"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "BOT_SUSPECTED"
  | "CAPTCHA_REQUIRED"
  | "SUSPICIOUS_ACTIVITY"
  | "EVENT_UNAVAILABLE"
  | "SOLD_OUT"
  | "TICKET_LIMIT_EXCEEDED"
  | "RESERVATION_FAILED"
  | "RESERVATION_EXPIRED"
  | "NOT_ACTIVE"
  | "INVALID_ORDER_STATE"
  | "PAYMENT_DECLINED"
  | "PAYMENT_TIMEOUT"
  | "DUPLICATE_PAYMENT_REPLAY"
  | "LOGIN_THROTTLED"
  | "INVENTORY_CONFLICT"
  | "SERVER_ERROR";

export interface ApiResponse {
  success: boolean;
  code: string;
  message: string;
  [key: string]: unknown;
}

export function fail(code: ErrorCode, message: string, extra: Record<string, unknown> = {}): ApiResponse {
  return { success: false, code, message, ...extra };
}

export function ok(code: string, message: string, extra: Record<string, unknown> = {}): ApiResponse {
  return { success: true, code, message, ...extra };
}

/** Recovery hint shown next to an error so users always know what to do next. */
export const RECOVERY_HINTS: Partial<Record<string, string>> = {
  RATE_LIMITED: "Wait about a minute, then try again.",
  SOLD_OUT: "Try a smaller quantity or another ticket category.",
  TICKET_LIMIT_EXCEEDED: "Reduce the quantity to stay within the per-person limit.",
  RESERVATION_EXPIRED: "Return to the event and reserve again — released tickets may still be available.",
  PAYMENT_DECLINED: "Your hold was released. Reserve again and use a different payment method.",
  PAYMENT_TIMEOUT: "Your hold was released. Reserve again to retry.",
  CAPTCHA_REQUIRED: "Complete the verification check and submit again.",
  BOT_SUSPECTED: "Slow down and submit the form normally.",
  UNAUTHORIZED: "Sign in and try again.",
  FORBIDDEN: "Your account does not have access to this area.",
  SERVER_ERROR: "Something went wrong on our side. Please try again.",
};

export function isApiResponse(value: unknown): value is ApiResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "success" in value &&
    "code" in value &&
    typeof (value as ApiResponse).code === "string"
  );
}
