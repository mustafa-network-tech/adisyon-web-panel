export type OrderStatus =
  | "draft"
  | "open"
  | "submitted"
  | "in_progress"
  | "ready"
  | "served"
  | "closed"
  | "cancelled";

export type OrderLine = {
  productId: string;
  name: string;
  quantity: number;
  unitPriceMinor: number;
};
