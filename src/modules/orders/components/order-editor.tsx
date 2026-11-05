"use client";

import { FormEvent, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChefHat, Clock3, Minus, Plus, Printer, RefreshCw, Send, Users } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { MenuProduct } from "@/modules/catalog/types";
import { buildBillReceipt } from "@/modules/receipts/builders";
import { PaperWidthSelect, useReceiptPrinter } from "@/modules/receipts/components/receipt-print";
import type { ReceiptBranding } from "@/modules/receipts/types";
import { appendOrderItemsAction, submitOrderAction, updateOrderItemAction } from "../actions";
import type { OrderLine, OrderSnapshot, OrderStatus } from "../types";

const statusLabels: Record<OrderStatus, string> = {
  draft: "Taslak",
  open: "Açık",
  submitted: "Mutfağa gönderildi",
  in_progress: "Hazırlanıyor",
  ready: "Hazır",
  served: "Servis edildi",
  closed: "Kapandı",
  cancelled: "İptal",
};

type OrderEditorProps = {
  tenant: string;
  branch: string;
  branchId: string;
  order: OrderSnapshot;
  products: MenuProduct[];
  branding: ReceiptBranding;
};

export function OrderEditor({ tenant, branch, branchId, order, products, branding }: OrderEditorProps) {
  const { print, receiptArea } = useReceiptPrinter();
  const router = useRouter();
  const [draft, setDraft] = useState<OrderLine[]>([]);
  const [feedback, setFeedback] = useState<{ type: "error" | "success"; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const appendKey = useRef<string | null>(null);
  const submitKey = useRef<string | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const refresh = () => router.refresh();
    const channel = supabase
      .channel(`order:${branchId}:${order.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `id=eq.${order.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items", filter: `order_id=eq.${order.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_status_history", filter: `order_id=eq.${order.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "kitchen_tickets", filter: `order_id=eq.${order.id}` }, refresh)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [branchId, order.id, router]);

  const pendingItemCount = useMemo(() => order.items.reduce((sum, item) => sum + Math.max(0, item.quantity - item.sentQuantity), 0), [order.items]);
  const stationMissing = order.items.some((item) => item.quantity > item.sentQuantity && item.fulfillment === "kitchen" && !item.kitchenStationId);
  const editable = !["closed", "cancelled"].includes(order.status);

  function changeDraft(product: MenuProduct, delta: number) {
    appendKey.current = null;
    setDraft((items) => {
      const existing = items.find((item) => item.productId === product.id);
      if (!existing && delta > 0) return [...items, { productId: product.id, name: product.name, quantity: 1, unitPriceMinor: product.priceMinor, notes: "" }];
      return items.map((item) => item.productId === product.id ? { ...item, quantity: item.quantity + delta } : item).filter((item) => item.quantity > 0);
    });
  }

  function appendItems() {
    if (draft.length === 0) return;
    appendKey.current ||= crypto.randomUUID();
    const requestKey = appendKey.current;
    setFeedback(null);
    startTransition(async () => {
      const result = await appendOrderItemsAction({ tenant, branch, orderId: order.id, expectedVersion: order.version, items: draft.map((item) => ({ productId: item.productId, quantity: item.quantity, notes: item.notes || "" })), idempotencyKey: requestKey });
      if (!result.ok) {
        setFeedback({ type: "error", message: result.message });
        if (result.code === "order_version_conflict") router.refresh();
        return;
      }
      setDraft([]);
      appendKey.current = null;
      submitKey.current = null;
      setFeedback({ type: "success", message: result.message });
      router.refresh();
    });
  }

  function updateItem(event: FormEvent<HTMLFormElement>, itemId: string) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const quantity = Number(formData.get("quantity"));
    const notes = String(formData.get("notes") || "");
    setFeedback(null);
    startTransition(async () => {
      const result = await updateOrderItemAction({ tenant, branch, orderId: order.id, orderItemId: itemId, expectedVersion: order.version, quantity, notes, idempotencyKey: crypto.randomUUID() });
      if (!result.ok) {
        setFeedback({ type: "error", message: result.message });
        if (result.code === "order_version_conflict") router.refresh();
        return;
      }
      submitKey.current = null;
      setFeedback({ type: "success", message: result.message });
      router.refresh();
    });
  }

  function submitOrder() {
    submitKey.current ||= crypto.randomUUID();
    const requestKey = submitKey.current;
    setFeedback(null);
    startTransition(async () => {
      const result = await submitOrderAction({ tenant, branch, orderId: order.id, expectedVersion: order.version, idempotencyKey: requestKey });
      if (!result.ok) {
        setFeedback({ type: "error", message: result.message });
        if (result.code === "order_version_conflict") router.refresh();
        return;
      }
      submitKey.current = null;
      setFeedback({ type: "success", message: result.message });
      router.refresh();
    });
  }

  return <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
    <section className="space-y-5">
      {receiptArea}
      <div className="rounded-[24px] border border-[#dfe5e1] bg-white p-5 sm:p-6"><div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="rounded-lg bg-[#fff0ea] px-3 py-1 text-xs font-black text-[#b94c2c]">{statusLabels[order.status]}</span><span className="rounded-lg bg-[#eef1ef] px-3 py-1 text-xs font-black text-[#68736e]">Sürüm {order.version}</span></div><h1 className="mt-4 text-3xl font-black tracking-[-0.04em]">Sipariş #{order.orderNumber}</h1><p className="mt-2 text-sm font-semibold text-[#7a8580]">{order.tableLabel} · {order.guestCount} kişi</p></div><div className="rounded-2xl bg-[#17211d] px-5 py-4 text-white"><p className="text-xs font-bold text-white/60">Genel toplam</p><p className="mt-1 text-3xl font-black">{formatMoney(order.totalMinor)}</p></div></div><div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[#edf0ee] pt-4"><button type="button" disabled={order.items.length === 0} onClick={() => print(buildBillReceipt({ orderNumber: order.orderNumber, tableLabel: order.tableLabel, serverName: order.serverName, openedAt: order.openedAt, items: order.items.map((item) => ({ name: item.productName, quantity: item.quantity, unitPriceMinor: item.unitPriceMinor, taxRate: item.taxRate, notes: item.notes, source: item.source })), branding }))} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#dce3df] px-4 text-sm font-black disabled:opacity-45"><Printer size={16} />Adisyon yazdır</button><PaperWidthSelect /></div></div>

      <div className="overflow-hidden rounded-[24px] border border-[#dfe5e1] bg-white"><div className="border-b border-[#e8ecea] p-5"><h2 className="text-lg font-black">Sipariş ürünleri</h2><p className="mt-1 text-xs font-semibold text-[#8a948f]">Fiyat, KDV ve ürün adı sipariş anındaki snapshot olarak saklanır.</p></div><div className="divide-y divide-[#edf0ee]">{order.items.map((item) => <form key={`${item.id}:${order.version}`} onSubmit={(event) => updateItem(event, item.id)} className="grid gap-3 p-4 sm:grid-cols-[1fr_100px_1fr_auto] sm:items-end"><div><p className="text-sm font-black">{item.productName}</p><p className="mt-1 text-xs font-bold text-[#8a948f]">{formatMoney(item.unitPriceMinor)} · KDV %{item.taxRate}{item.sentQuantity > 0 ? (item.fulfillment === "direct" ? " · doğrudan servis" : ` · ${item.sentQuantity} mutfağa gitti`) : ""}</p></div><label><span className="mb-1 block text-[10px] font-black uppercase tracking-[0.1em] text-[#8a948f]">Adet</span><input name="quantity" type="number" min={Math.max(1, item.sentQuantity)} max="99" defaultValue={item.quantity} disabled={!editable || isPending} className="min-h-11 w-full rounded-xl border border-[#dce3df] px-3 text-sm font-bold" /></label><label><span className="mb-1 block text-[10px] font-black uppercase tracking-[0.1em] text-[#8a948f]">Not</span><input name="notes" maxLength={500} defaultValue={item.notes || ""} disabled={!editable || isPending} placeholder="Ürün notu" className="min-h-11 w-full rounded-xl border border-[#dce3df] px-3 text-sm" /></label><button disabled={!editable || isPending} className="min-h-11 rounded-xl border border-[#dce3df] px-4 text-xs font-black disabled:opacity-45">Güncelle</button></form>)}{order.items.length === 0 && <p className="p-10 text-center text-sm font-semibold text-[#8a948f]">Siparişte ürün bulunmuyor.</p>}</div></div>

      {feedback && <p role={feedback.type === "error" ? "alert" : "status"} className={`rounded-xl p-4 text-sm font-bold ${feedback.type === "error" ? "bg-[#fff2ed] text-[#9e4328]" : "bg-[#eaf7f1] text-[#176e56]"}`}>{feedback.message}</p>}
    </section>

    <aside className="space-y-5">
      <div className="rounded-[24px] border border-[#dfe5e1] bg-white p-5"><div className="flex items-center gap-2"><ChefHat size={20} className="text-[#e8623a]" /><h2 className="text-lg font-black">Mutfağa gönder</h2></div><p className="mt-2 text-xs leading-5 text-[#7a8580]">Yalnızca henüz gönderilmemiş miktarlar için istasyon bazlı fiş üretilir. Doğrudan servis ürünleri (su, kola vb.) mutfağa gitmez.</p>{stationMissing && <p className="mt-3 rounded-xl bg-[#fff8e7] p-3 text-xs font-bold text-[#8a6415]">Bekleyen ürünlerden en az birinin mutfak istasyonu yok. Menü ayarlarından istasyon atayın.</p>}<button type="button" onClick={submitOrder} disabled={!editable || isPending || pendingItemCount === 0 || stationMissing} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#e8623a] px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-45"><Send size={17} />{isPending ? "İşleniyor…" : `${pendingItemCount} ürünü gönder`}</button></div>

      <div className="rounded-[24px] border border-[#dfe5e1] bg-white p-5"><div className="flex items-center gap-2"><Plus size={19} className="text-[#e8623a]" /><h2 className="text-lg font-black">Ürün ekle</h2></div><div className="mt-4 max-h-64 space-y-2 overflow-y-auto">{products.map((product) => { const line = draft.find((item) => item.productId === product.id); return <div key={product.id} className="flex items-center gap-2 rounded-xl bg-[#f5f7f6] p-3"><button type="button" onClick={() => changeDraft(product, 1)} disabled={!editable || isPending} className="min-w-0 flex-1 text-left"><span className="block truncate text-xs font-black">{product.name}</span><span className="mt-1 block text-[11px] font-bold text-[#e8623a]">{formatMoney(product.priceMinor)}</span></button>{line && <div className="flex items-center rounded-lg bg-white"><button type="button" onClick={() => changeDraft(product, -1)} className="grid size-8 place-items-center" aria-label={`${product.name} azalt`}><Minus size={13} /></button><span className="w-6 text-center text-xs font-black">{line.quantity}</span><button type="button" onClick={() => changeDraft(product, 1)} className="grid size-8 place-items-center" aria-label={`${product.name} artır`}><Plus size={13} /></button></div>}</div>; })}{products.length === 0 && <p className="py-6 text-center text-xs font-semibold text-[#8a948f]">Aktif ürün yok.</p>}</div><button type="button" onClick={appendItems} disabled={!editable || isPending || draft.length === 0} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#17211d] text-sm font-black text-white disabled:opacity-45"><Plus size={16} />Seçilenleri ekle</button></div>

      <div className="rounded-[24px] border border-[#dfe5e1] bg-white p-5"><div className="flex items-center gap-2"><Clock3 size={19} className="text-[#e8623a]" /><h2 className="text-lg font-black">Durum geçmişi</h2></div><div className="mt-4 space-y-3">{order.history.map((item) => <div key={item.id} className="flex gap-3"><span className="mt-1.5 size-2 rounded-full bg-[#e8623a]" /><div><p className="text-xs font-black">{statusLabels[item.status]}</p><p className="mt-1 text-[11px] font-semibold text-[#8a948f]">{new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(new Date(item.createdAt))}</p></div></div>)}{order.history.length === 0 && <p className="text-xs font-semibold text-[#8a948f]">Henüz durum kaydı yok.</p>}</div><button type="button" onClick={() => router.refresh()} className="mt-4 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#dce3df] text-xs font-black"><RefreshCw size={14} />Güncelle</button></div>

      <div className="rounded-[24px] border border-[#dfe5e1] bg-white p-5"><div className="flex items-center gap-2"><Users size={18} className="text-[#8a948f]" /><p className="text-xs font-black text-[#68736e]">Ara toplam {formatMoney(order.subtotalMinor)} · KDV {formatMoney(order.taxMinor)}</p></div></div>
    </aside>
  </div>;
}
