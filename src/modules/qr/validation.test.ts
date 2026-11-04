import { describe, expect, it } from "vitest";
import { customerOrderInputSchema, qrTokenSchema } from "./validation";

const token = "a".repeat(64);
const uuid = "123e4567-e89b-42d3-a456-426614174000";

describe("QR validation", () => {
  it("accepts only 64 character hex tokens", () => {
    expect(qrTokenSchema.safeParse(token).success).toBe(true);
    expect(qrTokenSchema.safeParse("abc").success).toBe(false);
    expect(qrTokenSchema.safeParse("g".repeat(64)).success).toBe(false);
  });

  it("validates a customer order", () => {
    const valid = customerOrderInputSchema.safeParse({
      token,
      idempotencyKey: uuid,
      items: [{ productId: uuid, quantity: 2, notes: " az pişmiş " }],
    });
    expect(valid.success).toBe(true);
    if (valid.success) expect(valid.data.items[0].notes).toBe("az pişmiş");
  });

  it("rejects empty orders and oversized quantities", () => {
    expect(
      customerOrderInputSchema.safeParse({ token, idempotencyKey: uuid, items: [] })
        .success,
    ).toBe(false);
    expect(
      customerOrderInputSchema.safeParse({
        token,
        idempotencyKey: uuid,
        items: [{ productId: uuid, quantity: 21 }],
      }).success,
    ).toBe(false);
  });
});
