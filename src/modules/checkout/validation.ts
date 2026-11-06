import { z } from "zod";
import { parseMoneyInput } from "@/lib/money";

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const route = { tenant: z.string().min(1).max(100), branch: z.string().min(1).max(100) };

export const openSessionSchema = z.object({ ...route, registerId: uuid, openingMinor: z.number().int().min(0), idempotencyKey: uuid });
export const paymentSchema = z.object({
  ...route,
  orderId: uuid,
  cashSessionId: uuid,
  payments: z.array(z.object({
    method: z.enum(["cash", "card"]),
    amountMinor: z.number().int().positive(),
    allocations: z.array(z.object({ orderItemId: uuid, quantity: z.number().int().positive() })).optional(),
  })).max(2),
  /** Discount or promotion given by the cashier while taking the payment. The kind is chosen explicitly. */
  adjustment: z.object({
    kind: z.enum(["discount", "promotion"]),
    amountMinor: z.number().int().positive(),
    reason: z.string().trim().max(200).optional(),
  }).optional(),
  idempotencyKey: uuid,
}).refine((value) => value.payments.length > 0 || value.adjustment !== undefined, { message: "payment_required" });
export const movementSchema = z.object({ ...route, cashSessionId: uuid, movementType: z.enum(["income", "expense"]), amountMinor: z.number().int().positive(), reason: z.string().trim().min(3).max(300), idempotencyKey: uuid });
export const closeSessionSchema = z.object({ ...route, cashSessionId: uuid, closingMinor: z.number().int().min(0), idempotencyKey: uuid });

export function moneyToMinor(value: unknown) {
  return typeof value === "string" ? parseMoneyInput(value) : null;
}
