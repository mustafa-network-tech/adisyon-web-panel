import { describe, expect, it } from "vitest";
import { formatMoney, parseMoneyInput } from "./money";

describe("formatMoney", () => {
  it("formats integer minor units without floating-point arithmetic", () => {
    const result = formatMoney(123456);

    expect(result).toContain("1.234,56");
    expect(result).toContain("₺");
  });

  it("formats zero", () => {
    expect(formatMoney(0)).toContain("0,00");
  });

  it("parses Turkish and dot decimal price input", () => {
    expect(parseMoneyInput("125,50")).toBe(12550);
    expect(parseMoneyInput("125.5")).toBe(12550);
    expect(parseMoneyInput("0")).toBe(0);
  });

  it("rejects malformed price input", () => {
    expect(parseMoneyInput("12,345")).toBeNull();
    expect(parseMoneyInput("-5")).toBeNull();
    expect(parseMoneyInput("ücretsiz")).toBeNull();
  });
});
