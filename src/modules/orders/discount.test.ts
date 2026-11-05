import { describe, expect, it } from "vitest";
import {
  describeDiscount,
  discountErrorMessage,
  itemDiscountInputSchema,
  orderDiscountInputSchema,
  parseDiscountValue,
  parsePercentInput,
} from "./discount";

const id = "10000000-0000-4000-8000-000000000001";
const base = { tenant: "t", branch: "b", orderId: id, expectedVersion: 3 };

describe("discount input", () => {
  it("reads percentages as basis points", () => {
    expect(parsePercentInput("10")).toBe(1000);
    expect(parsePercentInput("12,5")).toBe(1250);
    expect(parsePercentInput("%100")).toBe(10000);
    expect(parsePercentInput("0")).toBeUndefined();
    expect(parsePercentInput("101")).toBeUndefined();
    expect(parsePercentInput("abc")).toBeUndefined();
  });

  it("reads amounts in minor units", () => {
    expect(parseDiscountValue("amount", "25,50")).toBe(2550);
    expect(parseDiscountValue("amount", "0")).toBeUndefined();
    expect(parseDiscountValue("percent", "5")).toBe(500);
  });

  it("describes a discount", () => {
    expect(describeDiscount("percent", 1250)).toMatch(/12,5/);
    expect(describeDiscount(null, 0)).toBe("");
  });
});

describe("discount validation", () => {
  it("needs a reason of at least 3 characters to apply", () => {
    expect(orderDiscountInputSchema.safeParse({ ...base, kind: "percent", value: 1000, reason: "ikram" }).success).toBe(true);
    expect(orderDiscountInputSchema.safeParse({ ...base, kind: "percent", value: 1000, reason: "x" }).success).toBe(false);
  });

  it("caps percentages at 100% and allows removal without a value", () => {
    expect(orderDiscountInputSchema.safeParse({ ...base, kind: "percent", value: 10001, reason: "abc" }).success).toBe(false);
    expect(orderDiscountInputSchema.safeParse({ ...base, kind: "none", value: null, reason: "" }).success).toBe(true);
    expect(orderDiscountInputSchema.safeParse({ ...base, kind: "none", value: 5, reason: "" }).success).toBe(false);
  });

  it("validates item discounts the same way", () => {
    const input = { ...base, orderItemId: id, kind: "amount", value: 500, reason: "bayat" };
    expect(itemDiscountInputSchema.safeParse(input).success).toBe(true);
    expect(itemDiscountInputSchema.safeParse({ ...input, orderItemId: "nope" }).success).toBe(false);
  });

  it("maps database errors", () => {
    expect(discountErrorMessage("discount_denied")).toMatch(/yetkiniz yok/);
    expect(discountErrorMessage("boom")).toBe("İndirim uygulanamadı.");
  });
});
