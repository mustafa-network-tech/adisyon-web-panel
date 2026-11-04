"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/money";
import type { CheckoutOrder } from "@/modules/cash-register/types";
import type { DiningArea, RestaurantTable } from "@/modules/tables/types";

type Props = {
  areas: DiningArea[];
  tables: RestaurantTable[];
  orders: CheckoutOrder[];
  selectedOrderId: string | undefined;
  onSelectOrder: (orderId: string) => void;
};

export function CashierTables({ areas, tables, orders, selectedOrderId, onSelectOrder }: Props) {
  const [notice, setNotice] = useState("");
  const payable = new Map(orders.map((order) => [order.id, order]));
  const activeAreas = areas.filter((area) => area.isActive);

  const visibleTables = tables.filter((table) => activeAreas.some((area) => area.id === table.areaId));
  const occupied = visibleTables.filter((table) => table.activeOrderId).length;
  const waiting = visibleTables.filter((table) => table.activeOrderId && payable.has(table.activeOrderId)).length;

  function press(table: RestaurantTable) {
    if (!table.activeOrderId) return setNotice("");
    const order = payable.get(table.activeOrderId);
    if (order) {
      setNotice("");
      onSelectOrder(order.id);
      document.getElementById("odeme-paneli")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      setNotice(`${table.label}: sipariş #${table.activeOrderNumber ?? ""} mutfakta veya serviste. Servis edilince tahsilata hazır olur.`);
    }
  }

  return (
    <div className="mt-6 rounded-[24px] border border-[#dfe5e1] bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-black">Masalar</h2>
        <div className="flex flex-wrap gap-2 text-xs font-black">
          <span className="rounded-lg bg-[#e7f5ef] px-3 py-2 text-[#176e56]">Boş {visibleTables.length - occupied}</span>
          <span className="rounded-lg bg-[#fff0ea] px-3 py-2 text-[#b94c2c]">Dolu {occupied}</span>
          <span className="rounded-lg bg-[#17211d] px-3 py-2 text-white">Ödeme bekleyen {waiting}</span>
        </div>
      </div>

      {notice && <p role="status" className="mt-3 rounded-xl bg-[#fff9e9] p-3 text-xs font-bold text-[#9a6811]">{notice}</p>}

      <div className="mt-4 space-y-5">
        {activeAreas.map((area) => {
          const areaTables = tables.filter((table) => table.areaId === area.id);
          if (areaTables.length === 0) return null;
          return (
            <section key={area.id}>
              <h3 className="text-[11px] font-black uppercase tracking-[0.14em] text-[#8a948f]">{area.name}</h3>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
                {areaTables.map((table) => {
                  const order = table.activeOrderId ? payable.get(table.activeOrderId) : undefined;
                  const isSelected = Boolean(order && order.id === selectedOrderId);
                  let style = "border-[#dfe5e1] bg-white";
                  let label = "Boş";
                  let labelStyle = "text-[#23866b]";
                  if (table.status === "disabled") { style = "border-[#e1e6e3] bg-[#f1f3f2]"; label = "Kapalı"; labelStyle = "text-[#68736e]"; }
                  else if (table.status === "dirty") { style = "border-[#f0dca8] bg-[#fff9e9]"; label = "Temizlenecek"; labelStyle = "text-[#9a6811]"; }
                  else if (table.status === "reserved" && !table.activeOrderId) { style = "border-[#c9dcef] bg-[#f1f6fb]"; label = "Rezerve"; labelStyle = "text-[#285e9f]"; }
                  if (table.activeOrderId) {
                    if (order) { style = "border-[#17211d] bg-[#17211d]"; label = formatMoney(order.outstandingMinor); labelStyle = "text-white"; }
                    else { style = "border-[#f3c9b9] bg-[#fff7f3]"; label = "Sipariş açık"; labelStyle = "text-[#b94c2c]"; }
                  }
                  const dark = Boolean(order);
                  return (
                    <button
                      key={table.id}
                      type="button"
                      onClick={() => press(table)}
                      aria-pressed={isSelected}
                      className={`flex min-h-24 flex-col justify-between rounded-2xl border p-3 text-left transition ${style} ${isSelected ? "ring-4 ring-[#e8623a]/40" : ""} ${table.activeOrderId ? "cursor-pointer" : "cursor-default"}`}
                    >
                      <span className={`text-lg font-black ${dark ? "text-white" : "text-[#17211d]"}`}>{table.label}</span>
                      <span>
                        <span className={`block text-xs font-black ${labelStyle}`}>{label}</span>
                        {table.activeOrderNumber !== null && (
                          <span className={`mt-0.5 block text-[10px] font-bold ${dark ? "text-white/60" : "text-[#8a948f]"}`}>#{table.activeOrderNumber}{order ? " · ödeme bekliyor" : ""}</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
        {visibleTables.length === 0 && <p className="py-6 text-center text-sm font-semibold text-[#8a948f]">Henüz masa tanımlanmamış.</p>}
      </div>
    </div>
  );
}
