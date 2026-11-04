import { z } from "zod";
import { parseMoneyInput } from "@/lib/money";

const postgresUuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const optionalUuid = z.union([z.literal(""), postgresUuid]);

export const categoryInputSchema = z.object({
  id: optionalUuid,
  name: z.string().trim().min(2).max(80),
  isActive: z.boolean(),
});

export const productInputSchema = z.object({
  id: optionalUuid,
  categoryId: postgresUuid,
  kitchenStationId: optionalUuid,
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500),
  priceMinor: z.number().int().min(0).max(100_000_000),
  taxRate: z.number().min(0).max(100),
  isActive: z.boolean(),
});

export function parseCategoryInput(values: Record<string, unknown>) {
  return categoryInputSchema.safeParse(values);
}

export function parseProductInput(values: Record<string, unknown>) {
  const priceMinor =
    typeof values.price === "string" ? parseMoneyInput(values.price) : null;

  return productInputSchema.safeParse({
    ...values,
    priceMinor,
    taxRate: Number(values.taxRate),
  });
}
