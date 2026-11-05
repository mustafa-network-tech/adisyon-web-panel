import { describe, expect, it } from "vitest";
import { optionErrorMessage, optionGroupInputSchema } from "./option-validation";

const base = {
  tenant: "t",
  branch: "b",
  groupId: "",
  name: "Porsiyon",
  kind: "variant" as const,
  required: true,
  maxSelect: null,
  isActive: true,
  choices: [
    { id: "", name: "Yarım", priceDeltaMinor: -1000, isActive: true },
    { id: "", name: "Tam", priceDeltaMinor: 0, isActive: true },
  ],
  productIds: [],
};

describe("option group input", () => {
  it("accepts a portion group with a cheaper choice", () => {
    expect(optionGroupInputSchema.safeParse(base).success).toBe(true);
  });

  it("needs at least one choice and unique names", () => {
    expect(optionGroupInputSchema.safeParse({ ...base, choices: [] }).success).toBe(false);
    expect(
      optionGroupInputSchema.safeParse({
        ...base,
        choices: [
          { id: "", name: "Tam", priceDeltaMinor: 0, isActive: true },
          { id: "", name: "tam", priceDeltaMinor: 0, isActive: true },
        ],
      }).success,
    ).toBe(false);
  });

  it("keeps removals free and extras from discounting", () => {
    const paidRemoval = { ...base, kind: "removal" as const, choices: [{ id: "", name: "Soğan", priceDeltaMinor: 500, isActive: true }] };
    expect(optionGroupInputSchema.safeParse(paidRemoval).success).toBe(false);
    const cheapExtra = { ...base, kind: "extra" as const, choices: [{ id: "", name: "Peynir", priceDeltaMinor: -500, isActive: true }] };
    expect(optionGroupInputSchema.safeParse(cheapExtra).success).toBe(false);
    const goodExtra = { ...base, kind: "extra" as const, required: false, maxSelect: 2, choices: [{ id: "", name: "Peynir", priceDeltaMinor: 1500, isActive: true }] };
    expect(optionGroupInputSchema.safeParse(goodExtra).success).toBe(true);
  });

  it("maps database errors", () => {
    expect(optionErrorMessage("removal_must_be_free", "x")).toMatch(/ücretsiz/);
    expect(optionErrorMessage("boom", "yedek")).toBe("yedek");
  });
});
