import { z } from "zod";

/** Shared validation schemas — used by forms (UX) AND server functions (security). */
export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address").max(255);

export const passwordSchema = z
  .string()
  .min(10, "At least 10 characters")
  .max(128, "At most 128 characters")
  .regex(/[a-z]/, "Include a lowercase letter")
  .regex(/[A-Z]/, "Include an uppercase letter")
  .regex(/[0-9]/, "Include a number")
  .regex(/[^A-Za-z0-9]/, "Include a symbol");

export function passwordStrength(pw: string): { score: number; label: string } {
  let score = 0;
  if (pw.length >= 10) score++;
  if (pw.length >= 14) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const label = ["Very weak", "Weak", "Fair", "Good", "Strong", "Excellent"][score] ?? "Weak";
  return { score, label };
}

export const idempotencyKeySchema = z.string().regex(/^[A-Za-z0-9_-]{8,100}$/, "Invalid idempotency key");
export const uuidSchema = z.string().uuid();

export const reserveInputSchema = z.object({
  eventId: uuidSchema,
  items: z
    .array(z.object({ ticketTypeId: uuidSchema, quantity: z.number().int().min(1).max(20) }))
    .min(1, "Select at least one ticket")
    .max(10),
  idempotencyKey: idempotencyKeySchema,
  honeypot: z.string().max(200).optional().default(""),
  formFillMs: z.number().int().min(0).max(86_400_000).nullable().optional().default(null),
  captchaToken: z.string().max(2048).optional(),
});
export type ReserveInput = z.infer<typeof reserveInputSchema>;

export const customerInfoSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Enter your full name")
    .max(100)
    .regex(/^[\p{L}\p{M} .'-]+$/u, "Letters, spaces, apostrophes and hyphens only"),
  email: emailSchema,
});

export const startCheckoutSchema = customerInfoSchema.extend({ reservationId: uuidSchema });

export const paymentSchema = z.object({
  orderId: uuidSchema,
  outcome: z.enum(["SUCCESS", "DECLINED", "TIMEOUT"]),
  paymentKey: idempotencyKeySchema,
});

export const ticketTokenInputSchema = z.object({
  token: z.string().trim().min(10).max(80),
  eventId: uuidSchema,
  checkIn: z.boolean(),
});

export const eventInputSchema = z.object({
  id: uuidSchema.optional(),
  slug: z.string().regex(/^[a-z0-9-]{3,80}$/, "Lowercase letters, numbers and hyphens (3–80)"),
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().max(4000),
  venue: z.string().trim().min(2).max(160),
  city: z.string().trim().max(80),
  startsAt: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date")
    .refine((v) => Date.parse(v) > Date.now() - 86_400_000, "Date must be in the future"),
  holdMinutes: z.number().int().min(1).max(60),
  perUserLimit: z.number().int().min(1).max(20),
  highDemand: z.boolean(),
  status: z.enum(["DRAFT", "PUBLISHED", "CANCELLED"]),
});
export type EventInput = z.infer<typeof eventInputSchema>;

export const ticketTypeInputSchema = z.object({
  eventId: uuidSchema,
  id: uuidSchema.optional(),
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300),
  priceCents: z.number().int().min(0).max(10_000_000),
  totalQuantity: z.number().int().min(0).max(1_000_000),
  sortOrder: z.number().int().min(0).max(1000),
});
