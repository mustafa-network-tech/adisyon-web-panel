import { formatMoney, parseMoneyInput } from "@/lib/money";

export type OptionKind = "variant" | "extra" | "removal";

export type OptionChoice = {
  id: string;
  name: string;
  /** Price change in minor units; negative for a smaller portion. */
  priceDeltaMinor: number;
  soldOut: boolean;
};

export type OptionGroup = {
  id: string;
  name: string;
  kind: OptionKind;
  minSelect: number;
  maxSelect: number | null;
  choices: OptionChoice[];
};

export const optionKindLabels: Record<OptionKind, string> = {
  variant: "Porsiyon / boy (tek seçim)",
  extra: "Ekstra (çoklu seçim)",
  removal: "Çıkarılacak malzeme",
};

/** Checks a guest's or waiter's picks against the product's groups; returns a Turkish message or null. */
export function validateSelection(groups: OptionGroup[], selectedIds: string[]): string | null {
  const known = new Map(groups.flatMap((group) => group.choices.map((choice) => [choice.id, { group, choice }] as const)));
  for (const id of selectedIds) {
    const entry = known.get(id);
    if (!entry) return "Seçilen seçeneklerden biri bu ürün için geçerli değil.";
    if (entry.choice.soldOut) return `${entry.choice.name} bugün tükendi.`;
  }
  for (const group of groups) {
    const count = group.choices.filter((choice) => selectedIds.includes(choice.id)).length;
    if (count < group.minSelect) {
      return group.kind === "variant" ? `${group.name} seçin.` : `${group.name} için en az ${group.minSelect} seçim yapın.`;
    }
    if (group.maxSelect !== null && count > group.maxSelect) {
      return `${group.name} için en fazla ${group.maxSelect} seçim yapabilirsiniz.`;
    }
  }
  return null;
}

export function selectionDeltaMinor(groups: OptionGroup[], selectedIds: string[]) {
  return groups
    .flatMap((group) => group.choices)
    .filter((choice) => selectedIds.includes(choice.id))
    .reduce((sum, choice) => sum + choice.priceDeltaMinor, 0);
}

export type PickedOption = { groupName: string; kind: OptionKind; name: string; priceDeltaMinor: number };

export function pickedOptions(groups: OptionGroup[], selectedIds: string[]): PickedOption[] {
  return groups.flatMap((group) =>
    group.choices
      .filter((choice) => selectedIds.includes(choice.id))
      .map((choice) => ({ groupName: group.name, kind: group.kind, name: choice.name, priceDeltaMinor: choice.priceDeltaMinor })),
  );
}

/** Same product with the same picks is the same cart line, whatever the click order. */
export function optionLineKey(productId: string, selectedIds: string[]) {
  return [productId, ...[...selectedIds].sort()].join(":");
}

export function formatDelta(deltaMinor: number) {
  if (deltaMinor === 0) return "";
  return `${deltaMinor > 0 ? "+" : "−"}${formatMoney(Math.abs(deltaMinor))}`;
}

/** Short label for kitchen tickets, bills and cart lines. */
export function optionLabel(kind: OptionKind, name: string) {
  if (kind === "extra") return `+ ${name}`;
  if (kind === "removal") return `Çıkar: ${name}`;
  return name;
}

export function groupRuleText(group: Pick<OptionGroup, "kind" | "minSelect" | "maxSelect">) {
  const required = group.minSelect > 0 ? "Zorunlu" : "İsteğe bağlı";
  if (group.kind === "variant") return `${required} · tek seçim`;
  return group.maxSelect === null ? `${required} · istediğiniz kadar` : `${required} · en fazla ${group.maxSelect}`;
}

/** Cheapest price a guest can pay: base plus the cheapest required pick of each group. */
export function startingPriceMinor(basePriceMinor: number, groups: OptionGroup[]) {
  const extra = groups.reduce((sum, group) => {
    if (group.minSelect < 1) return sum;
    const cheapest = group.choices.filter((choice) => !choice.soldOut).map((choice) => choice.priceDeltaMinor).sort((a, b) => a - b).slice(0, group.minSelect);
    return sum + cheapest.reduce((total, delta) => total + delta, 0);
  }, 0);
  return basePriceMinor + extra;
}

/** "15", "+15,50" or "-100" -> minor units (signed); empty means no change; undefined when invalid. */
export function parsePriceDelta(value: string): number | undefined {
  const text = value.trim().replace(/^\+/, "");
  if (text === "") return 0;
  const negative = text.startsWith("-") || text.startsWith("−");
  const amount = parseMoneyInput(negative ? text.slice(1) : text);
  if (amount === null) return undefined;
  return negative ? -amount : amount;
}
