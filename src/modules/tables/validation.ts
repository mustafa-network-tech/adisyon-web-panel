import { z } from "zod";

const postgresUuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const optionalUuid = z.union([z.literal(""), postgresUuid]);

export const diningAreaInputSchema = z.object({
  id: optionalUuid,
  name: z.string().trim().min(2).max(80),
  isActive: z.boolean(),
});

export const restaurantTableInputSchema = z.object({
  id: optionalUuid,
  areaId: postgresUuid,
  label: z.string().trim().min(1).max(30),
  capacity: z.number().int().min(1).max(100),
  status: z.enum(["available", "dirty", "reserved", "disabled"]),
});

export function parseDiningAreaInput(values: Record<string, unknown>) {
  return diningAreaInputSchema.safeParse(values);
}

export function parseRestaurantTableInput(values: Record<string, unknown>) {
  return restaurantTableInputSchema.safeParse({
    ...values,
    capacity: Number(values.capacity),
  });
}
