import { z } from "zod";

const uuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

export const qrTokenSchema = z.string().regex(/^[0-9a-f]{64}$/);

export const callWaiterInputSchema = z.object({
  token: qrTokenSchema,
  kind: z.enum(["waiter", "bill"]),
});

export const rotateTokenInputSchema = z.object({
  tenant: z.string().trim().min(1).max(100),
  branch: z.string().trim().min(1).max(100),
  tableId: uuid,
});
