import { describe, expect, it } from "vitest";
import { kitchenTransitionInputSchema } from "./validation";

describe("kitchen transition validation", () => {
  it("accepts a shaped transition request", () => {
    expect(
      kitchenTransitionInputSchema.safeParse({
        tenant: "demo",
        branch: "merkez",
        ticketId: "f1000000-0000-0000-0000-000000000001",
        expectedStatus: "new",
        nextStatus: "preparing",
        idempotencyKey: "f2000000-0000-0000-0000-000000000001",
      }).success,
    ).toBe(true);
  });

  it("rejects values outside the active workflow", () => {
    expect(
      kitchenTransitionInputSchema.safeParse({
        tenant: "demo",
        branch: "merkez",
        ticketId: "f1000000-0000-0000-0000-000000000001",
        expectedStatus: "new",
        nextStatus: "served",
        idempotencyKey: "f2000000-0000-0000-0000-000000000001",
      }).success,
    ).toBe(false);
  });
});
