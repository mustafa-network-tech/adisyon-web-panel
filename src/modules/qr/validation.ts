import { z } from "zod";

const uuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

export const qrTokenSchema = z.string().regex(/^[0-9a-f]{64}$/);

export const customerOrderInputSchema = z.object({
  token: qrTokenSchema,
  idempotencyKey: uuid,
  items: z
    .array(
      z.object({
        productId: uuid,
        quantity: z.number().int().min(1).max(20),
        notes: z.string().trim().max(200).default(""),
      }),
    )
    .min(1)
    .max(40),
});

export const setOrderingInputSchema = z.object({
  tenant: z.string().trim().min(1).max(100),
  branch: z.string().trim().min(1).max(100),
  enabled: z.boolean(),
});

export const rotateTokenInputSchema = z.object({
  tenant: z.string().trim().min(1).max(100),
  branch: z.string().trim().min(1).max(100),
  tableId: uuid,
});
