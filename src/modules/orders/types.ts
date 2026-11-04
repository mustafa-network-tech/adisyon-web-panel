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
  notes?: string;
};

export type OrderItemSnapshot = {
  id: string;
  productId: string | null;
  kitchenStationId: string | null;
  productName: string;
  quantity: number;
  sentQuantity: number;
  unitPriceMinor: number;
  taxRate: number;
  lineTotalMinor: number;
  notes: string | null;
};

export type OrderStatusHistoryItem = {
  id: number;
  status: OrderStatus;
  actorUserId: string;
  createdAt: string;
};

export type OrderSnapshot = {
  id: string;
  orderNumber: number;
  tableId: string | null;
  tableLabel: string;
  status: OrderStatus;
  guestCount: number;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
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
