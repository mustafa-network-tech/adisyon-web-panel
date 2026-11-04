import { describe, expect, it } from "vitest";
import {
  openOrderInputSchema,
  submitOrderInputSchema,
  updateOrderItemInputSchema,
} from "./validation";

const orderId = "a1000000-0000-0000-0000-000000000001";
const itemId = "a2000000-0000-0000-0000-000000000001";
const productId = "a3000000-0000-0000-0000-000000000001";
const key = "a4000000-0000-0000-0000-000000000001";

describe("order input validation", () => {
  it("accepts a complete order draft", () => {
    const result = openOrderInputSchema.safeParse({
      tenant: "demo",
      branch: "merkez",
      tableId: orderId,
      guestCount: 2,
      items: [{ productId, quantity: 3, notes: "Soğansız" }],
      idempotencyKey: key,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty drafts and invalid quantities", () => {
    expect(
      openOrderInputSchema.safeParse({
        tenant: "demo",
        branch: "merkez",
        tableId: orderId,
        guestCount: 0,
        items: [],
        idempotencyKey: key,
      }).success,
    ).toBe(false);
  });

  it("accepts an item edit and a versioned submit", () => {
    expect(
      updateOrderItemInputSchema.safeParse({
        tenant: "demo",
        branch: "merkez",
        orderId,
        orderItemId: itemId,
        expectedVersion: 2,
        quantity: 4,
        notes: "Az pişmiş",
        idempotencyKey: key,
      }).success,
    ).toBe(true);
    expect(
      submitOrderInputSchema.safeParse({
        tenant: "demo",
        branch: "merkez",
        orderId,
        expectedVersion: 2,
        idempotencyKey: key,
      }).success,
    ).toBe(true);
  });
});
