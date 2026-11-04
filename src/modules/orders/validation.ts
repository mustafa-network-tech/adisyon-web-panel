import { z } from "zod";

const postgresUuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

const routeSchema = z.object({
  tenant: z.string().trim().min(1).max(100),
  branch: z.string().trim().min(1).max(100),
});

export const orderDraftItemSchema = z.object({
  productId: postgresUuid,
  quantity: z.number().int().min(1).max(99),
  notes: z.string().trim().max(500).default(""),
});

export const openOrderInputSchema = routeSchema.extend({
  tableId: postgresUuid,
  guestCount: z.number().int().min(1).max(100),
  items: z.array(orderDraftItemSchema).min(1).max(100),
  idempotencyKey: postgresUuid,
});

export const appendOrderItemsInputSchema = routeSchema.extend({
  orderId: postgresUuid,
  expectedVersion: z.number().int().positive(),
  items: z.array(orderDraftItemSchema).min(1).max(100),
  idempotencyKey: postgresUuid,
});

export const updateOrderItemInputSchema = routeSchema.extend({
  orderId: postgresUuid,
  orderItemId: postgresUuid,
  expectedVersion: z.number().int().positive(),
  quantity: z.number().int().min(1).max(99),
  notes: z.string().trim().max(500),
  idempotencyKey: postgresUuid,
});

export const submitOrderInputSchema = routeSchema.extend({
  orderId: postgresUuid,
  expectedVersion: z.number().int().positive(),
  idempotencyKey: postgresUuid,
});
