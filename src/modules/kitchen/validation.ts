import { z } from "zod";

const postgresUuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

export const kitchenTransitionInputSchema = z
  .object({
    tenant: z.string().trim().min(1).max(100),
    branch: z.string().trim().min(1).max(100),
    ticketId: postgresUuid,
    expectedStatus: z.enum(["new", "preparing", "ready"]),
    nextStatus: z.enum(["preparing", "ready", "served"]),
    idempotencyKey: postgresUuid,
  })
  .refine(
    (value) =>
      (value.expectedStatus === "new" && value.nextStatus === "preparing") ||
      (value.expectedStatus === "preparing" && value.nextStatus === "ready") ||
      (value.expectedStatus === "ready" && value.nextStatus === "served"),
    { message: "Geçersiz mutfak durum geçişi." },
  );
