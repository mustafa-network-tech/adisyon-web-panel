import type { OptionChoice, OptionGroup, OptionKind } from "./options";

export type Fulfillment = "kitchen" | "direct";

export type MenuProduct = {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  description: string | null;
  priceMinor: number;
  taxRate: number;
  kitchenStationId: string | null;
  kitchenStationName: string | null;
  /** null = inherits the category setting */
  fulfillment: Fulfillment | null;
  /** True when the product was marked sold out for today. */
  soldOut: boolean;
  /** Active option groups (portion, extras, removals) with their choices. */
  optionGroups: OptionGroup[];
  isActive: boolean;
};

export type MenuCategory = {
  id: string;
  name: string;
  sortOrder: number;
  fulfillment: Fulfillment;
  isActive: boolean;
};

export type KitchenStationOption = {
  id: string;
  name: string;
  color: string;
  isActive: boolean;
};

export type OptionChoiceAdmin = OptionChoice & { isActive: boolean };

export type OptionGroupAdmin = {
  id: string;
  name: string;
  kind: OptionKind;
  minSelect: number;
  maxSelect: number | null;
  isActive: boolean;
  choices: OptionChoiceAdmin[];
  productIds: string[];
};

export type CatalogSnapshot = {
  optionGroups: OptionGroupAdmin[];
  categories: MenuCategory[];
  products: MenuProduct[];
  kitchenStations: KitchenStationOption[];
};
