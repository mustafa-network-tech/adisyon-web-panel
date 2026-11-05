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
  /** Product plus chosen options; identical picks share one line. */
  lineKey: string;
  productId: string;
  name: string;
  quantity: number;
  unitPriceMinor: number;
  notes?: string;
  optionIds: string[];
  /** Readable picks such as "Büyük", "+ Peynir", "Çıkar: Soğan". */
  optionLabels: string[];
};

export type OrderItemOption = {
  groupName: string;
  kind: "variant" | "extra" | "removal";
  name: string;
  priceDeltaMinor: number;
};

export type OrderItemSnapshot = {
  id: string;
  productId: string | null;
  kitchenStationId: string | null;
  fulfillment: "kitchen" | "direct";
  source: "staff" | "qr";
  productName: string;
  options: OrderItemOption[];
  quantity: number;
  sentQuantity: number;
  unitPriceMinor: number;
  /** Set when an item discount lowered the unit price. */
  listUnitPriceMinor: number | null;
  discountReason: string | null;
  taxRate: number;
  lineTotalMinor: number;
  notes: string | null;
};

export type OrderStatusHistoryItem = {
  id: number;
  status: OrderStatus;
  actorUserId: string | null;
  createdAt: string;
};

export type OrderSnapshot = {
  id: string;
  orderNumber: number;
  tableId: string | null;
  tableLabel: string;
  /** Staff member who opened the order; null when the customer did via QR. */
  serverName: string | null;
  status: OrderStatus;
  guestCount: number;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  /** Adisyon discount actually applied, in minor units. */
  discountMinor: number;
  discountType: "amount" | "percent" | null;
  /** Minor units for "amount", basis points (1000 = 10%) for "percent". */
  discountValue: number;
  discountReason: string | null;
  version: number;
  openedAt: string;
  items: OrderItemSnapshot[];
  history: OrderStatusHistoryItem[];
};

export type OrderActionResult =
  | {
      ok: true;
      message: string;
      orderId: string;
      version: number;
    }
  | {
      ok: false;
      code: string;
      message: string;
    };
