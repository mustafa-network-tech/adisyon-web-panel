import { describe, expect, it } from "vitest";
import { formatMoney } from "./money";

describe("formatMoney", () => {
  it("formats integer minor units without floating-point arithmetic", () => {
    const result = formatMoney(123456);

    expect(result).toContain("1.234,56");
    expect(result).toContain("₺");
  });

  it("formats zero", () => {
    expect(formatMoney(0)).toContain("0,00");
  });
});
