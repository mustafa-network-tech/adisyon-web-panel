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

export type CatalogSnapshot = {
  categories: MenuCategory[];
  products: MenuProduct[];
  kitchenStations: KitchenStationOption[];
};
