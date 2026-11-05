import type { MenuProduct } from "@/modules/catalog/types";
import { optionLabel, optionLineKey, pickedOptions, selectionDeltaMinor } from "@/modules/catalog/options";
import type { OrderLine } from "./types";

/** Adds a product with its chosen options; the same product with the same picks becomes one line. */
export function addToDraft(lines: OrderLine[], product: MenuProduct, optionIds: string[]): OrderLine[] {
  const lineKey = optionLineKey(product.id, optionIds);
  const existing = lines.find((line) => line.lineKey === lineKey);
  if (existing) return lines.map((line) => (line.lineKey === lineKey ? { ...line, quantity: Math.min(99, line.quantity + 1) } : line));
  return [
    ...lines,
    {
      lineKey,
      productId: product.id,
      name: product.name,
      quantity: 1,
      unitPriceMinor: product.priceMinor + selectionDeltaMinor(product.optionGroups, optionIds),
      notes: "",
      optionIds: [...optionIds],
      optionLabels: pickedOptions(product.optionGroups, optionIds).map((item) => optionLabel(item.kind, item.name)),
    },
  ];
}

export function changeLineQuantity(lines: OrderLine[], lineKey: string, delta: number): OrderLine[] {
  return lines
    .map((line) => (line.lineKey === lineKey ? { ...line, quantity: Math.min(99, line.quantity + delta) } : line))
    .filter((line) => line.quantity > 0);
}

export function changeLineNotes(lines: OrderLine[], lineKey: string, notes: string): OrderLine[] {
  return lines.map((line) => (line.lineKey === lineKey ? { ...line, notes } : line));
}

export function draftTotalMinor(lines: OrderLine[]) {
  return lines.reduce((sum, line) => sum + line.quantity * line.unitPriceMinor, 0);
}

/** What the order actions send to the database. */
export function draftItems(lines: OrderLine[]) {
  return lines.map((line) => ({
    productId: line.productId,
    quantity: line.quantity,
    notes: line.notes || "",
    options: line.optionIds,
  }));
}
