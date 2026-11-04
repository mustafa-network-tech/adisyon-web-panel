export type KitchenTicketStatus = "new" | "preparing" | "ready";

export type KitchenTicket = {
  id: string;
  orderNumber: string;
  tableLabel: string;
  station: "Sıcak" | "Soğuk" | "Bar";
  status: KitchenTicketStatus;
  ageMinutes: number;
  server: string;
  items: { quantity: number; name: string; note?: string }[];
};
