import type { KitchenTicket } from "./types";

export const initialKitchenTickets: KitchenTicket[] = [
  { id: "k1", orderNumber: "#184", tableLabel: "M03", station: "Sıcak", status: "new", ageMinutes: 2, server: "Zeynep", items: [{ quantity: 2, name: "Izgara Tavuk" }, { quantity: 1, name: "Çıtır Karides", note: "Acısız" }] },
  { id: "k2", orderNumber: "#182", tableLabel: "B03", station: "Soğuk", status: "new", ageMinutes: 4, server: "Arda", items: [{ quantity: 2, name: "Akdeniz Salata", note: "Soğansız" }] },
  { id: "k3", orderNumber: "#179", tableLabel: "M05", station: "Sıcak", status: "preparing", ageMinutes: 12, server: "Arda", items: [{ quantity: 2, name: "Dana Lokum", note: "Orta pişmiş" }, { quantity: 1, name: "Izgara Tavuk" }] },
  { id: "k4", orderNumber: "#178", tableLabel: "T02", station: "Bar", status: "preparing", ageMinutes: 15, server: "Ece", items: [{ quantity: 3, name: "Ev Yapımı Limonata" }, { quantity: 2, name: "Soda" }] },
  { id: "k5", orderNumber: "#176", tableLabel: "M06", station: "Sıcak", status: "ready", ageMinutes: 18, server: "Ece", items: [{ quantity: 1, name: "Dana Lokum" }, { quantity: 1, name: "Çıtır Karides" }] },
  { id: "k6", orderNumber: "#175", tableLabel: "M02", station: "Soğuk", status: "ready", ageMinutes: 21, server: "Ece", items: [{ quantity: 2, name: "Akdeniz Salata" }] },
];
