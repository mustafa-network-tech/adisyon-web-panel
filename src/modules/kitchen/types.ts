export type KitchenTicketStatus =
  | "new"
  | "preparing"
  | "ready"
  | "served"
  | "cancelled";

export type ActiveKitchenTicketStatus = Extract<
  KitchenTicketStatus,
  "new" | "preparing" | "ready"
>;

export type KitchenTicketItem = {
  orderItemId: string;
  quantity: number;
  name: string;
  /** Chosen options: "Büyük", "+ Peynir", "Çıkar: Soğan". */
  options: string[];
  note: string | null;
};

export type KitchenTicket = {
  id: string;
  orderId: string;
  orderNumber: number;
  tableLabel: string;
  stationId: string;
  stationName: string;
  stationColor: string;
  status: ActiveKitchenTicketStatus;
  sentAt: string;
  startedAt: string | null;
  readyAt: string | null;
  serverName: string;
  items: KitchenTicketItem[];
};

export type KitchenStationFilter = {
  id: string;
  name: string;
  color: string;
};

export type KitchenSnapshot = {
  tickets: KitchenTicket[];
  stations: KitchenStationFilter[];
};

export type KitchenActionResult =
  | { ok: true; message: string }
  | { ok: false; code: string; message: string };
