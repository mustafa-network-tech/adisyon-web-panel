import { describe, expect, it } from "vitest";
import { moneyToMinor, paymentSchema } from "./validation";

describe("checkout validation", () => {
  it("parses Turkish money input", () => {
    expect(moneyToMinor("1.250,50")).toBe(125050);
  });

  it("accepts separately auditable mixed payment rows", () => {
    const id = "c1000000-0000-0000-0000-000000000001";
    expect(paymentSchema.safeParse({ tenant: "demo", branch: "merkez", orderId: id, cashSessionId: id, payments: [{ method: "cash", amountMinor: 5000 }, { method: "card", amountMinor: 7500 }], idempotencyKey: id }).success).toBe(true);
  });
});
