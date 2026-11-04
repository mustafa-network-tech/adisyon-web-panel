export type TableStatus = "available" | "dirty" | "reserved" | "disabled";

export type DiningArea = {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
};

export type RestaurantTable = {
  id: string;
  label: string;
  areaId: string;
  areaName: string;
  capacity: number;
  status: TableStatus;
  sortOrder: number;
};

export type DiningSnapshot = {
  areas: DiningArea[];
  tables: RestaurantTable[];
};
