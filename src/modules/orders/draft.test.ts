import { describe, expect, it } from "vitest";
import type { MenuProduct } from "@/modules/catalog/types";
import { addToDraft, changeLineNotes, changeLineQuantity, draftItems, draftTotalMinor } from "./draft";

const product: MenuProduct = {
  id: "kebab",
  categoryId: "c",
  categoryName: "Yemek",
  name: "Kebap",
  description: null,
  priceMinor: 36550,
  taxRate: 10,
  kitchenStationId: null,
  kitchenStationName: null,
  fulfillment: null,
  soldOut: false,
  isActive: true,
  optionGroups: [
    {
      id: "g1",
      name: "Porsiyon",
      kind: "variant",
      minSelect: 1,
      maxSelect: 1,
      choices: [
        { id: "full", name: "Tam", priceDeltaMinor: 0, soldOut: false },
        { id: "big", name: "Büyük", priceDeltaMinor: 8000, soldOut: false },
      ],
    },
    {
      id: "g2",
      name: "Çıkar",
      kind: "removal",
      minSelect: 0,
      maxSelect: null,
      choices: [{ id: "onion", name: "Soğan", priceDeltaMinor: 0, soldOut: false }],
    },
  ],
};

describe("order draft", () => {
  it("prices a line with its options and labels them for the kitchen", () => {
    const lines = addToDraft([], product, ["big", "onion"]);
    expect(lines).toHaveLength(1);
    expect(lines[0].unitPriceMinor).toBe(44550);
    expect(lines[0].optionLabels).toEqual(["Büyük", "Çıkar: Soğan"]);
  });

  it("merges identical picks and separates different ones", () => {
    let lines = addToDraft([], product, ["big", "onion"]);
    lines = addToDraft(lines, product, ["onion", "big"]);
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(2);
    lines = addToDraft(lines, product, ["full"]);
    expect(lines).toHaveLength(2);
  });

  it("changes quantity and notes per line and drops empty lines", () => {
    let lines = addToDraft(addToDraft([], product, ["big"]), product, ["full"]);
    const bigKey = lines[0].lineKey;
    lines = changeLineNotes(lines, bigKey, "az pişmiş");
    expect(lines[0].notes).toBe("az pişmiş");
    lines = changeLineQuantity(lines, bigKey, -1);
    expect(lines).toHaveLength(1);
    expect(lines[0].optionIds).toEqual(["full"]);
  });

  it("sums the total and prepares the action payload", () => {
    const lines = addToDraft(addToDraft([], product, ["big"]), product, ["full"]);
    expect(draftTotalMinor(lines)).toBe(44550 + 36550);
    expect(draftItems(lines)[0]).toEqual({ productId: "kebab", quantity: 1, notes: "", options: ["big"] });
  });
});
