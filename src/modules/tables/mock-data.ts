import type { MenuProduct } from "@/modules/catalog/types";
import type { RestaurantTable } from "./types";

export const demoTables: RestaurantTable[] = [
  { id: "m01", label: "M01", area: "Salon", capacity: 2, status: "available", totalMinor: 0 },
  { id: "m02", label: "M02", area: "Salon", capacity: 4, status: "occupied", totalMinor: 124000, elapsedMinutes: 34, server: "Ece" },
  { id: "m03", label: "M03", area: "Salon", capacity: 4, status: "waiting", totalMinor: 86000, elapsedMinutes: 19, server: "Zeynep" },
  { id: "m04", label: "M04", area: "Salon", capacity: 6, status: "available", totalMinor: 0 },
  { id: "m05", label: "M05", area: "Salon", capacity: 6, status: "occupied", totalMinor: 218000, elapsedMinutes: 47, server: "Arda" },
  { id: "m06", label: "M06", area: "Salon", capacity: 4, status: "ready", totalMinor: 148000, elapsedMinutes: 28, server: "Ece" },
  { id: "b01", label: "B01", area: "Bahçe", capacity: 4, status: "occupied", totalMinor: 73000, elapsedMinutes: 16, server: "Arda" },
  { id: "b02", label: "B02", area: "Bahçe", capacity: 8, status: "available", totalMinor: 0 },
  { id: "b03", label: "B03", area: "Bahçe", capacity: 4, status: "waiting", totalMinor: 92000, elapsedMinutes: 24, server: "Zeynep" },
  { id: "t01", label: "T01", area: "Teras", capacity: 2, status: "available", totalMinor: 0 },
  { id: "t02", label: "T02", area: "Teras", capacity: 4, status: "occupied", totalMinor: 166000, elapsedMinutes: 39, server: "Ece" },
];

export const demoProducts: MenuProduct[] = [
  { id: "p1", categoryId: "main", name: "Dana Lokum", priceMinor: 58500, kitchenStation: "hot" },
  { id: "p2", categoryId: "main", name: "Izgara Tavuk", priceMinor: 36500, kitchenStation: "hot" },
  { id: "p3", categoryId: "starter", name: "Çıtır Karides", priceMinor: 29500, kitchenStation: "hot" },
  { id: "p4", categoryId: "starter", name: "Akdeniz Salata", priceMinor: 18500, kitchenStation: "cold" },
  { id: "p5", categoryId: "drink", name: "Ev Yapımı Limonata", priceMinor: 9500, kitchenStation: "bar" },
  { id: "p6", categoryId: "drink", name: "Soda", priceMinor: 4500, kitchenStation: "bar" },
];
