import { describe, expect, it } from "vitest";
import { actionLabel, auditCategories, categoryPrefixes, summarizeMetadata } from "./labels";

describe("audit labels", () => {
  it("translates known actions and keeps unknown ones visible", () => {
    expect(actionLabel("order.merged")).toBe("Adisyonlar birleştirildi");
    expect(actionLabel("something.new")).toBe("something.new");
  });

  it("maps categories to action prefixes", () => {
    expect(categoryPrefixes("payroll")).toEqual(["payroll."]);
    expect(categoryPrefixes("orders")).toContain("order_item.");
    expect(categoryPrefixes("nope")).toBeNull();
    expect(categoryPrefixes(undefined)).toBeNull();
    expect(new Set(auditCategories.map((category) => category.id)).size).toBe(auditCategories.length);
  });

  it("summarizes details without internal identifiers", () => {
    const text = summarizeMetadata({ branchId: "x", membershipId: "y", reason: "ikram", type: "percent", value: 1000, minutes: 450 });
    expect(text).toBe("Gerekçe: ikram · Tür: percent · Dakika: 450");
    expect(text).not.toContain("branchId");
    expect(summarizeMetadata({})).toBe("");
  });
});
