import { describe, expect, it } from "vitest";
import { callWaiterInputSchema, qrTokenSchema } from "./validation";

const token = "a".repeat(64);

describe("QR validation", () => {
  it("accepts only 64 character hex tokens", () => {
    expect(qrTokenSchema.safeParse(token).success).toBe(true);
    expect(qrTokenSchema.safeParse("abc").success).toBe(false);
    expect(qrTokenSchema.safeParse("g".repeat(64)).success).toBe(false);
  });

  it("validates a waiter call", () => {
    expect(callWaiterInputSchema.safeParse({ token, kind: "waiter" }).success).toBe(true);
    expect(callWaiterInputSchema.safeParse({ token, kind: "bill" }).success).toBe(true);
    expect(callWaiterInputSchema.safeParse({ token, kind: "order" }).success).toBe(false);
  });
});
