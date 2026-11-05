"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChefHat, Clock3, CloudOff, Printer, RefreshCw, Wifi } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { buildKitchenReceipt } from "@/modules/receipts/builders";
import { PaperWidthSelect, useReceiptPrinter } from "@/modules/receipts/components/receipt-print";
import type { ReceiptBranding } from "@/modules/receipts/types";
import { transitionKitchenTicketAction } from "../actions";
import { getKitchenActionLabel, getNextKitchenStatus } from "../lifecycle";
import type { ActiveKitchenTicketStatus, KitchenSnapshot } from "../types";

const columns: { status: ActiveKitchenTicketStatus; title: string; eyebrow: string; accent: string }[] = [
  { status: "new", title: "Yeni siparişler", eyebrow: "Sırada", accent: "bg-[color:var(--c-accent)]" },
  { status: "preparing", title: "Hazırlanıyor", eyebrow: "Mutfakta", accent: "bg-[#e3a53b]" },
  { status: "ready", title: "Servise hazır", eyebrow: "Tamamlandı", accent: "bg-[#23866b]" },
];

type KitchenBoardProps = KitchenSnapshot & {
  tenant: string;
  branch: string;
  branchId: string;
  canUpdate: boolean;
  branding: ReceiptBranding;
};

export function KitchenBoard({ tenant, branch, branchId, canUpdate, branding, tickets, stations }: KitchenBoardProps) {
  const { print, receiptArea } = useReceiptPrinter();
  const router = useRouter();
  const [stationId, setStationId] = useState("all");
  const [now, setNow] = useState(() => Date.now());
  const [online, setOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [pendingTicketId, setPendingTicketId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleOnline = () => { setOnline(true); router.refresh(); };
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [router]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`kitchen:${branchId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "kitchen_tickets", filter: `branch_id=eq.${branchId}` }, () => router.refresh())
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setRealtimeConnected(true);
        if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) setRealtimeConnected(false);
      });
    return () => { void supabase.removeChannel(channel); };
  }, [branchId, router]);

  const visibleTickets = useMemo(() => tickets.filter((ticket) => stationId === "all" || ticket.stationId === stationId), [stationId, tickets]);
  const averageAge = visibleTickets.length === 0 ? 0 : Math.round(visibleTickets.reduce((sum, ticket) => sum + Math.max(0, Math.floor((now - new Date(ticket.sentAt).getTime()) / 60_000)), 0) / visibleTickets.length);

  function advance(ticketId: string, status: ActiveKitchenTicketStatus) {
    if (!canUpdate || !online) return;
    setFeedback("");
    setPendingTicketId(ticketId);
    startTransition(async () => {
      const result = await transitionKitchenTicketAction({ tenant, branch, ticketId, expectedStatus: status, nextStatus: getNextKitchenStatus(status), idempotencyKey: crypto.randomUUID() });
      setPendingTicketId(null);
      if (!result.ok) {
        setFeedback(result.message);
        if (result.code === "kitchen_status_conflict") router.refresh();
        return;
      }
      router.refresh();
    });
  }

  return <section className="p-4 sm:p-6 lg:p-8">
    {receiptArea}
    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div><p className="text-xs font-black uppercase tracking-[0.16em] text-[color:var(--c-accent)]">Mutfak ekranı</p><h1 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">Sipariş akışı</h1><p className="mt-2 text-sm font-semibold text-[#7a8580]">{visibleTickets.length} aktif fiş · Ortalama bekleme {averageAge} dk</p></div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center"><PaperWidthSelect /><span className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-black ${online && realtimeConnected ? "bg-[#e7f5ef] text-[#176e56]" : "bg-[#fff2ed] text-[#9e4328]"}`}>{online && realtimeConnected ? <Wifi size={15} /> : <CloudOff size={15} />}{!online ? "Çevrimdışı" : realtimeConnected ? "Canlı bağlantı" : "Yeniden bağlanıyor"}</span><div className="flex gap-2 overflow-x-auto pb-1"><button type="button" onClick={() => setStationId("all")} className={`min-h-11 shrink-0 rounded-xl px-4 text-xs font-black ${stationId === "all" ? "bg-[color:var(--c-ink)] text-white" : "border border-[#dce3df] bg-white text-[#68736e]"}`}>Tümü</button>{stations.map((station) => <button key={station.id} type="button" onClick={() => setStationId(station.id)} className={`min-h-11 shrink-0 rounded-xl px-4 text-xs font-black ${stationId === station.id ? "bg-[color:var(--c-ink)] text-white" : "border border-[#dce3df] bg-white text-[#68736e]"}`}>{station.name}</button>)}</div></div>
    </div>

    {feedback && <div className="mt-5 flex items-center justify-between rounded-xl bg-[#fff2ed] p-4 text-sm font-bold text-[#9e4328]"><span>{feedback}</span><button type="button" onClick={() => router.refresh()} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-white px-3 text-xs"><RefreshCw size={14} />Yenile</button></div>}

    <div className="mt-7 grid gap-5 xl:grid-cols-3">{columns.map((column) => {
      const columnTickets = visibleTickets.filter((ticket) => ticket.status === column.status);
      return <div key={column.status} className="rounded-[24px] border border-[#dfe5e1] bg-[#ecefed] p-3 sm:p-4"><div className="flex items-center justify-between px-2 py-2"><div><p className="text-[10px] font-black uppercase tracking-[0.15em] text-[#8a948f]">{column.eyebrow}</p><h2 className="mt-1 text-lg font-black">{column.title}</h2></div><span className={`grid size-9 place-items-center rounded-xl text-sm font-black text-white ${column.accent}`}>{columnTickets.length}</span></div><div className="mt-3 space-y-3">{columnTickets.map((ticket) => {
        const ageMinutes = Math.max(0, Math.floor((now - new Date(ticket.sentAt).getTime()) / 60_000));
        const urgent = ageMinutes >= 15;
        const ticketPending = isPending && pendingTicketId === ticket.id;
        return <article key={ticket.id} className={`overflow-hidden rounded-2xl border bg-white shadow-[0_8px_24px_rgb(23_33_29/0.06)] ${urgent ? "border-[#e8aaa0]" : "border-[#dfe5e1]"}`}><div className="flex items-center justify-between border-b border-[#edf0ee] p-4"><div className="flex items-center gap-3"><span className={`grid size-10 place-items-center rounded-xl ${column.status === "new" ? "bg-[color:var(--c-accent-soft)] text-[color:var(--c-accent-d2)]" : column.status === "preparing" ? "bg-[#fff7de] text-[#9a6811]" : "bg-[#e7f5ef] text-[#176e56]"}`}><ChefHat size={19} /></span><div><p className="text-lg font-black">{ticket.tableLabel} <span className="text-sm text-[#8a948f]">#{ticket.orderNumber}</span></p><p className="mt-0.5 text-[11px] font-bold text-[#8a948f]">Garson · {ticket.serverName}</p></div></div><span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-black ${urgent ? "bg-[#fff0ee] text-[#b63b32]" : "bg-[#f0f2f1] text-[#68736e]"}`}><Clock3 size={13} />{ageMinutes} dk</span></div><div className="p-4"><p className="mb-3 inline-flex items-center gap-1.5 rounded-lg bg-[#f1f3f2] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#68736e]"><span className="size-2 rounded-full" style={{ backgroundColor: ticket.stationColor }} />{ticket.stationName}</p><ul className="space-y-3">{ticket.items.map((item) => <li key={item.orderItemId} className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[color:var(--c-ink)] text-xs font-black text-white">{item.quantity}</span><span><span className="block text-sm font-black">{item.name}</span>{item.options.map((option) => <span key={option} className="mt-0.5 block text-xs font-black text-[color:var(--c-ink)]">{option}</span>)}{item.note && <span className="mt-1 block text-xs font-bold text-[color:var(--c-accent-d1)]">Not: {item.note}</span>}</span></li>)}</ul><button type="button" onClick={() => print(buildKitchenReceipt(ticket, branding))} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#dce3df] px-3 text-xs font-black text-[color:var(--c-ink)]"><Printer size={15} />Fişi yazdır</button></div><button type="button" onClick={() => advance(ticket.id, ticket.status)} disabled={!canUpdate || !online || ticketPending} className={`flex min-h-12 w-full items-center justify-center gap-2 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-45 ${column.status === "new" ? "bg-[color:var(--c-accent)]" : column.status === "preparing" ? "bg-[#d99a2e]" : "bg-[#23866b]"}`}>{ticketPending ? "Güncelleniyor…" : !canUpdate ? "Salt okunur" : column.status === "ready" ? <><Check size={17} />{getKitchenActionLabel(ticket.status)}</> : getKitchenActionLabel(ticket.status)}</button></article>;
      })}{columnTickets.length === 0 && <div className="grid min-h-36 place-items-center rounded-2xl border border-dashed border-[#cdd5d1] text-center"><div><Check className="mx-auto text-[#98a39d]" /><p className="mt-2 text-xs font-bold text-[#8a948f]">Bu sütun temiz</p></div></div>}</div></div>;
    })}</div>
  </section>;
}
