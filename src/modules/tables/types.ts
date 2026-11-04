export type TableStatus = "available" | "occupied" | "waiting" | "ready";

export type RestaurantTable = {
  id: string;
  label: string;
  area: "Salon" | "Bahçe" | "Teras";
  capacity: number;
  status: TableStatus;
  totalMinor: number;
  elapsedMinutes?: number;
  server?: string;
};
