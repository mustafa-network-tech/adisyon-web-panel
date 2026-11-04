export type MenuProduct = {
  id: string;
  categoryId: string;
  name: string;
  priceMinor: number;
  kitchenStation: "hot" | "cold" | "bar";
};
