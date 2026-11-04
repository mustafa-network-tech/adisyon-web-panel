"use client";

import { useState } from "react";
import { Check, ChefHat, Clock3, Flame, Snowflake, Wine } from "lucide-react";
import { initialKitchenTickets } from "../mock-data";
import type { KitchenTicket, KitchenTicketStatus } from "../types";

const columns: { status: KitchenTicketStatus; title: string; eyebrow: string; accent: string }[] = [
  { status: "new", title: "Yeni siparişler", eyebrow: "Sırada", accent: "bg-[#e8623a]" },
  { status: "preparing", title: "Hazırlanıyor", eyebrow: "Mutfakta", accent: "bg-[#e3a53b]" },
  { status: "ready", title: "Servise hazır", eyebrow: "Tamamlandı", accent: "bg-[#23866b]" },
];

const stationIcon = { Sıcak: Flame, Soğuk: Snowflake, Bar: Wine };

export function KitchenBoard() {
  const [tickets, setTickets] = useState(initialKitchenTickets);
  const [station, setStation] = useState<"Tümü" | KitchenTicket["station"]>("Tümü");

  function advance(id: string, status: KitchenTicketStatus) {
    const next: Record<KitchenTicketStatus, KitchenTicketStatus | null> = { new: "preparing", preparing: "ready", ready: null };
    const nextStatus = next[status];
    setTickets((items) => nextStatus ? items.map((item) => item.id === id ? { ...item, status: nextStatus } : item) : items.filter((item) => item.id !== id));
  }

  return (
    <section className="p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-black uppercase tracking-[0.16em] text-[#e8623a]">Mutfak ekranı</p><h1 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">Sipariş akışı</h1><p className="mt-2 text-sm font-semibold text-[#7a8580]">{tickets.length} aktif fiş · Ortalama hazırlık 11 dk</p></div>
        <div className="flex gap-2 overflow-x-auto pb-1">{(["Tümü", "Sıcak", "Soğuk", "Bar"] as const).map((item) => <button key={item} type="button" onClick={() => setStation(item)} className={`min-h-11 shrink-0 rounded-xl px-4 text-xs font-black ${station === item ? "bg-[#17211d] text-white" : "border border-[#dce3df] bg-white text-[#68736e]"}`}>{item}</button>)}</div>
      </div>

      <div className="mt-7 grid gap-5 xl:grid-cols-3">
        {columns.map((column) => {
          const columnTickets = tickets.filter((ticket) => ticket.status === column.status && (station === "Tümü" || ticket.station === station));
          return (
            <div key={column.status} className="rounded-[24px] border border-[#dfe5e1] bg-[#ecefed] p-3 sm:p-4">
              <div className="flex items-center justify-between px-2 py-2"><div><p className="text-[10px] font-black uppercase tracking-[0.15em] text-[#8a948f]">{column.eyebrow}</p><h2 className="mt-1 text-lg font-black">{column.title}</h2></div><span className={`grid size-9 place-items-center rounded-xl text-sm font-black text-white ${column.accent}`}>{columnTickets.length}</span></div>
              <div className="mt-3 space-y-3">
                {columnTickets.map((ticket) => {
                  const StationIcon = stationIcon[ticket.station];
                  const urgent = ticket.ageMinutes >= 15;
                  return (
                    <article key={ticket.id} className={`overflow-hidden rounded-2xl border bg-white shadow-[0_8px_24px_rgb(23_33_29/0.06)] ${urgent ? "border-[#e8aaa0]" : "border-[#dfe5e1]"}`}>
                      <div className="flex items-center justify-between border-b border-[#edf0ee] p-4"><div className="flex items-center gap-3"><span className={`grid size-10 place-items-center rounded-xl ${column.status === "new" ? "bg-[#fff0ea] text-[#c94927]" : column.status === "preparing" ? "bg-[#fff7de] text-[#9a6811]" : "bg-[#e7f5ef] text-[#176e56]"}`}><ChefHat size={19} /></span><div><p className="text-lg font-black">{ticket.tableLabel} <span className="text-sm text-[#8a948f]">{ticket.orderNumber}</span></p><p className="mt-0.5 text-[11px] font-bold text-[#8a948f]">Garson · {ticket.server}</p></div></div><span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-black ${urgent ? "bg-[#fff0ee] text-[#b63b32]" : "bg-[#f0f2f1] text-[#68736e]"}`}><Clock3 size={13} />{ticket.ageMinutes} dk</span></div>
                      <div className="p-4"><p className="mb-3 inline-flex items-center gap-1.5 rounded-lg bg-[#f1f3f2] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#68736e]"><StationIcon size={12} />{ticket.station}</p><ul className="space-y-3">{ticket.items.map((item, index) => <li key={`${item.name}-${index}`} className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[#17211d] text-xs font-black text-white">{item.quantity}</span><span><span className="block text-sm font-black">{item.name}</span>{item.note && <span className="mt-1 block text-xs font-bold text-[#d8542f]">Not: {item.note}</span>}</span></li>)}</ul></div>
                      <button type="button" onClick={() => advance(ticket.id, ticket.status)} className={`flex min-h-12 w-full items-center justify-center gap-2 text-sm font-black text-white ${column.status === "new" ? "bg-[#e8623a]" : column.status === "preparing" ? "bg-[#d99a2e]" : "bg-[#23866b]"}`}>{column.status === "new" ? "Hazırlamaya başla" : column.status === "preparing" ? "Hazır olarak işaretle" : <><Check size={17} /> Servise teslim et</>}</button>
                    </article>
                  );
                })}
                {columnTickets.length === 0 && <div className="grid min-h-36 place-items-center rounded-2xl border border-dashed border-[#cdd5d1] text-center"><div><Check className="mx-auto text-[#98a39d]" /><p className="mt-2 text-xs font-bold text-[#8a948f]">Bu sütun temiz</p></div></div>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
