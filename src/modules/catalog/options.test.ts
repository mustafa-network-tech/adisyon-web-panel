import { describe, expect, it } from "vitest";
import {
  formatDelta,
  groupRuleText,
  parsePriceDelta,
  optionLabel,
  optionLineKey,
  pickedOptions,
  selectionDeltaMinor,
  startingPriceMinor,
  validateSelection,
  type OptionGroup,
} from "./options";

const portion: OptionGroup = {
  id: "g1",
  name: "Porsiyon",
  kind: "variant",
  minSelect: 1,
  maxSelect: 1,
  choices: [
    { id: "half", name: "Yarım", priceDeltaMinor: -10000, soldOut: false },
    { id: "full", name: "Tam", priceDeltaMinor: 0, soldOut: false },
    { id: "big", name: "Büyük", priceDeltaMinor: 8000, soldOut: false },
  ],
};
const extras: OptionGroup = {
  id: "g2",
  name: "Ekstralar",
  kind: "extra",
  minSelect: 0,
  maxSelect: 2,
  choices: [
    { id: "cheese", name: "Peynir", priceDeltaMinor: 1500, soldOut: false },
    { id: "sauce", name: "Sos", priceDeltaMinor: 1000, soldOut: true },
    { id: "mushroom", name: "Mantar", priceDeltaMinor: 2000, soldOut: false },
    { id: "egg", name: "Yumurta", priceDeltaMinor: 500, soldOut: false },
  ],
};
const removals: OptionGroup = {
  id: "g3",
  name: "Çıkar",
  kind: "removal",
  minSelect: 0,
  maxSelect: null,
  choices: [{ id: "onion", name: "Soğan", priceDeltaMinor: 0, soldOut: false }],
};
const groups = [portion, extras, removals];

describe("option selection", () => {
  it("requires the portion and accepts a valid pick", () => {
    expect(validateSelection(groups, [])).toBe("Porsiyon seçin.");
    expect(validateSelection(groups, ["full"])).toBeNull();
    expect(validateSelection(groups, ["big", "cheese", "onion"])).toBeNull();
  });

  it("enforces the limits and refuses sold out or foreign choices", () => {
    expect(validateSelection(groups, ["big", "half"])).toMatch(/en fazla 1/);
    expect(validateSelection(groups, ["full", "cheese", "mushroom", "egg"])).toMatch(/en fazla 2/);
    expect(validateSelection(groups, ["full", "sauce"])).toBe("Sos bugün tükendi.");
    expect(validateSelection(groups, ["full", "nope"])).toMatch(/geçerli değil/);
  });

  it("prices the pick and lists what was chosen", () => {
    expect(selectionDeltaMinor(groups, ["big", "cheese", "onion"])).toBe(9500);
    expect(selectionDeltaMinor(groups, ["half"])).toBe(-10000);
    expect(pickedOptions(groups, ["big", "onion"]).map((item) => item.name)).toEqual(["Büyük", "Soğan"]);
  });

  it("builds stable cart keys and readable labels", () => {
    expect(optionLineKey("p", ["b", "a"])).toBe(optionLineKey("p", ["a", "b"]));
    expect(optionLineKey("p", [])).not.toBe(optionLineKey("p", ["a"]));
    expect(optionLabel("extra", "Peynir")).toBe("+ Peynir");
    expect(optionLabel("removal", "Soğan")).toBe("Çıkar: Soğan");
    expect(optionLabel("variant", "Büyük")).toBe("Büyük");
    expect(formatDelta(0)).toBe("");
    expect(formatDelta(1500)).toMatch(/^\+/);
    expect(formatDelta(-1500)).toMatch(/^−/);
  });

  it("explains the rule of a group and shows a starting price", () => {
    expect(groupRuleText(portion)).toBe("Zorunlu · tek seçim");
    expect(groupRuleText(extras)).toBe("İsteğe bağlı · en fazla 2");
    expect(groupRuleText(removals)).toBe("İsteğe bağlı · istediğiniz kadar");
    expect(startingPriceMinor(36550, groups)).toBe(36550 - 10000);
    expect(startingPriceMinor(4000, [])).toBe(4000);
  });
});

describe("price change input", () => {
  it("reads signed Turkish amounts", () => {
    expect(parsePriceDelta("")).toBe(0);
    expect(parsePriceDelta("15")).toBe(1500);
    expect(parsePriceDelta("+15,50")).toBe(1550);
    expect(parsePriceDelta("-100")).toBe(-10000);
    expect(parsePriceDelta("−2,5")).toBe(-250);
    expect(parsePriceDelta("abc")).toBeUndefined();
    expect(parsePriceDelta("1,234")).toBeUndefined();
  });
});
