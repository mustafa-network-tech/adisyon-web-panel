"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, Search, ShoppingBag, Users, X } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { MenuProduct } from "@/modules/catalog/types";
import { OptionPicker } from "@/modules/catalog/components/option-picker";
import { startingPriceMinor } from "@/modules/catalog/options";
import { openOrderAction } from "@/modules/orders/actions";
import { addToDraft, changeLineNotes, changeLineQuantity, draftItems, draftTotalMinor } from "@/modules/orders/draft";
import type { OrderLine } from "@/modules/orders/types";
import type { DiningArea, RestaurantTable, TableStatus } from "../types";

type DisplayStatus = TableStatus | "occupied";

const statusMeta: Record<DisplayStatus, { label: string; dot: string; surface: string; text: string }> = {
  available: { label: "Kullanıma hazır", dot: "bg-[#23866b]", surface: "bg-white", text: "text-[#23866b]" },
  occupied: { label: "Sipariş açık", dot: "bg-[color:var(--c-accent)]", surface: "bg-[#fff7f3]", text: "text-[color:var(--c-accent-d6)]" },
  dirty: { label: "Temizlenecek", dot: "bg-[#e3a53b]", surface: "bg-[#fff9e9]", text: "text-[#9a6811]" },
  reserved: { label: "Rezerve", dot: "bg-[#285e9f]", surface: "bg-[#f1f6fb]", text: "text-[#285e9f]" },
  disabled: { label: "Kapalı", dot: "bg-[#9ca5a0]", surface: "bg-[#f1f3f2]", text: "text-[#68736e]" },
};

type TableBoardProps = {
  tenant: string;
  branch: string;
  branchId: string;
  areas: DiningArea[];
  tables: RestaurantTable[];
  products: MenuProduct[];
};

export function TableBoard({ tenant, branch, branchId, areas, tables: allTables, products: allProducts }: TableBoardProps) {
  const router = useRouter();
  const activeAreas = useMemo(() => areas.filter((area) => area.isActive), [areas]);
  const [areaId, setAreaId] = useState(activeAreas[0]?.id || "");
  const [selected, setSelected] = useState<RestaurantTable | null>(null);
  const [order, setOrder] = useState<OrderLine[]>([]);
  const [pickerProduct, setPickerProduct] = useState<MenuProduct | null>(null);
  const [query, setQuery] = useState("");
  const [guestCount, setGuestCount] = useState(2);
  const [feedback, setFeedback] = useState("");
  const [isOpening, startOpening] = useTransition();
  const idempotencyKey = useRef<string | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`table-orders:${branchId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `branch_id=eq.${branchId}` }, () => router.refresh())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [branchId, router]);

  const currentAreaId = activeAreas.some((area) => area.id === areaId)
    ? areaId
    : activeAreas[0]?.id || "";
  const tables = allTables.filter((table) => table.areaId === currentAreaId);
  const products = allProducts.filter((product) => product.isActive && product.name.toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR")));
  const total = useMemo(() => draftTotalMinor(order), [order]);

  function addProduct(productId: string) {
    const product = allProducts.find((item) => item.id === productId && item.isActive);
    if (!product || product.soldOut) return;
    idempotencyKey.current = null;
    if (product.optionGroups.length > 0) {
      setPickerProduct(product);
      return;
    }
    setOrder((items) => addToDraft(items, product, []));
  }

  function confirmOptions(selectedIds: string[]) {
    if (!pickerProduct) return;
    idempotencyKey.current = null;
    setOrder((items) => addToDraft(items, pickerProduct, selectedIds));
    setPickerProduct(null);
  }

  function changeQuantity(lineKey: string, delta: number) {
    idempotencyKey.current = null;
    setOrder((items) => changeLineQuantity(items, lineKey, delta));
  }

  function changeNotes(lineKey: string, notes: string) {
    idempotencyKey.current = null;
    setOrder((items) => changeLineNotes(items, lineKey, notes));
  }

  function selectTable(table: RestaurantTable) {
    if (table.activeOrderId) {
      router.push(`/app/${tenant}/${branch}/siparis/${table.activeOrderId}`);
      return;
    }
    if (table.status === "dirty" || table.status === "disabled") return;
    setSelected(table);
    setOrder([]);
    setFeedback("");
    idempotencyKey.current = null;
  }

  function openOrder() {
    if (!selected || order.length === 0) return;
    idempotencyKey.current ||= crypto.randomUUID();
    const requestKey = idempotencyKey.current;
    setFeedback("");
    startOpening(async () => {
      const result = await openOrderAction({
        tenant,
        branch,
        tableId: selected.id,
        guestCount,
        items: draftItems(order),
        idempotencyKey: requestKey,
      });
      if (!result.ok) {
        setFeedback(result.message);
        if (result.code === "table_has_active_order") router.refresh();
        return;
      }
      router.push(`/app/${tenant}/${branch}/siparis/${result.orderId}`);
    });
  }

  return <div className="grid min-h-[calc(100dvh-76px)] xl:grid-cols-[1fr_420px]">
    <section className="min-w-0 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-black uppercase tracking-[0.16em] text-[color:var(--c-accent)]">Masa yönetimi</p><h1 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">Servis alanları</h1><p className="mt-2 text-sm font-semibold text-[#7a8580]">{allTables.length} masa · {allTables.filter((table) => table.activeOrderId).length} açık sipariş</p></div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1">{activeAreas.map((area) => <button key={area.id} type="button" onClick={() => { setAreaId(area.id); setSelected(null); }} className={`min-h-11 shrink-0 rounded-xl px-5 text-sm font-black transition ${currentAreaId === area.id ? "bg-[color:var(--c-ink)] text-white" : "border border-[#dce3df] bg-white text-[#68736e]"}`}>{area.name}</button>)}</div>
      </div>
      <div className="mt-7 flex flex-wrap gap-4 text-[11px] font-bold text-[#68736e]">{(Object.entries(statusMeta) as [DisplayStatus, (typeof statusMeta)[DisplayStatus]][]).map(([key, value]) => <span key={key} className="inline-flex items-center gap-2"><span className={`size-2 rounded-full ${value.dot}`} />{value.label}</span>)}</div>
      {activeAreas.length === 0 ? <div className="mt-8 rounded-[22px] border border-dashed border-[#cfd7d3] bg-white p-12 text-center"><h2 className="text-xl font-black">Aktif servis alanı yok</h2><p className="mt-2 text-sm text-[#7a8580]">Bir yönetici Ayarlar → Salon &amp; masalar bölümünden alan oluşturmalıdır.</p></div> : <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
        {tables.map((table) => {
          const displayStatus: DisplayStatus = table.activeOrderId ? "occupied" : table.status;
          const meta = statusMeta[displayStatus];
          const isSelected = selected?.id === table.id;
          const unavailable = !table.activeOrderId && (table.status === "dirty" || table.status === "disabled");
          return <button key={table.id} type="button" disabled={unavailable} onClick={() => selectTable(table)} className={`min-h-40 rounded-[22px] border p-4 text-left shadow-[0_8px_24px_rgb(23_33_29/0.04)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-65 ${meta.surface} ${isSelected ? "border-[color:var(--c-accent)] ring-4 ring-[color:var(--c-accent-soft)]" : "border-[#dfe5e1]"}`}><div className="flex items-center justify-between"><span className="text-lg font-black">{table.label}</span><span className={`size-2.5 rounded-full ${meta.dot}`} /></div><p className={`mt-6 text-sm font-black ${meta.text}`}>{meta.label}</p><div className="mt-3 flex items-center gap-1 text-[11px] font-bold text-[#8a948f]"><Users size={13} />{table.capacity} kişi</div><p className="mt-4 truncate text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#a1aaa5]">{table.activeOrderNumber ? `Sipariş #${table.activeOrderNumber}` : table.areaName}</p></button>;
        })}
        {tables.length === 0 && <div className="col-span-full rounded-[22px] border border-dashed border-[#cfd7d3] bg-white p-10 text-center text-sm font-semibold text-[#8a948f]">Bu alanda henüz masa bulunmuyor.</div>}
      </div>}
    </section>

    {pickerProduct && <OptionPicker productName={pickerProduct.name} basePriceMinor={pickerProduct.priceMinor} groups={pickerProduct.optionGroups} onConfirm={confirmOptions} onCancel={() => setPickerProduct(null)} />}
    <aside className={`fixed inset-0 z-50 bg-white transition-transform duration-300 xl:static xl:z-auto xl:block xl:border-l xl:border-[#dfe5e1] ${selected ? "translate-x-0" : "translate-x-full xl:translate-x-0"}`} aria-label="Sipariş oluşturma paneli">
      {selected ? <div className="flex h-dvh flex-col xl:h-[calc(100dvh-76px)]">
        <div className="flex items-center justify-between border-b border-[#e5e9e7] p-5"><div><p className="text-xs font-black uppercase tracking-[0.15em] text-[color:var(--c-accent)]">Yeni sipariş</p><h2 className="mt-1 text-2xl font-black">{selected.label} · {selected.areaName}</h2></div><button type="button" onClick={() => setSelected(null)} className="grid size-11 place-items-center rounded-xl bg-[#f0f2f1] text-[#68736e] xl:hidden" aria-label="Paneli kapat"><X size={20} /></button></div>
        <div className="grid grid-cols-[1fr_92px] gap-3 border-b border-[#e5e9e7] p-4"><label className="flex min-h-11 items-center gap-2 rounded-xl bg-[#f1f3f2] px-3"><Search size={17} className="text-[#8a948f]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ürün ara" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label><label><span className="sr-only">Kişi sayısı</span><input type="number" min="1" max="100" value={guestCount} onChange={(event) => setGuestCount(Number(event.target.value))} className="min-h-11 w-full rounded-xl border border-[#dce3df] px-3 text-sm font-bold" aria-label="Kişi sayısı" /></label></div>
        <div className="scrollbar-thin flex-1 overflow-y-auto p-4"><p className="mb-3 text-[11px] font-black uppercase tracking-[0.14em] text-[#8a948f]">Aktif ürünler</p><div className="grid grid-cols-2 gap-2">{products.map((product) => <button key={product.id} type="button" onClick={() => addProduct(product.id)} disabled={product.soldOut} className="min-h-20 rounded-xl border border-[#dfe5e1] bg-white p-3 text-left hover:border-[color:var(--c-accent)] disabled:opacity-55"><span className="block text-sm font-black leading-5">{product.name}</span><span className={`mt-2 block text-xs font-bold ${product.soldOut ? "text-[#b63b32]" : "text-[color:var(--c-accent)]"}`}>{product.soldOut ? "Bugün tükendi" : product.optionGroups.length > 0 ? `${formatMoney(startingPriceMinor(product.priceMinor, product.optionGroups))} · seçenekli` : formatMoney(product.priceMinor)}</span></button>)}{products.length === 0 && <p className="col-span-2 rounded-xl bg-[#f5f7f6] p-5 text-center text-xs font-semibold text-[#8a948f]">Aktif ürün bulunamadı.</p>}</div>
          {order.length > 0 && <><p className="mb-3 mt-6 text-[11px] font-black uppercase tracking-[0.14em] text-[#8a948f]">Sipariş ürünleri</p><div className="space-y-2">{order.map((item) => <div key={item.lineKey} className="rounded-xl bg-[#f5f7f6] p-3"><div className="flex items-center gap-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{item.name}</p>{item.optionLabels.length > 0 && <p className="mt-0.5 text-[11px] font-bold leading-4 text-[#68736e]">{item.optionLabels.join(" · ")}</p>}<p className="mt-1 text-xs font-bold text-[#68736e]">{formatMoney(item.unitPriceMinor * item.quantity)}</p></div><div className="flex items-center rounded-lg border border-[#d9e0dc] bg-white"><button type="button" onClick={() => changeQuantity(item.lineKey, -1)} className="grid size-9 place-items-center" aria-label={`${item.name} azalt`}><Minus size={14} /></button><span className="w-7 text-center text-xs font-black">{item.quantity}</span><button type="button" onClick={() => changeQuantity(item.lineKey, 1)} className="grid size-9 place-items-center" aria-label={`${item.name} artır`}><Plus size={14} /></button></div></div><input value={item.notes || ""} onChange={(event) => changeNotes(item.lineKey, event.target.value)} maxLength={500} placeholder="Ürün notu (isteğe bağlı)" className="mt-2 min-h-10 w-full rounded-lg border border-[#dfe5e1] bg-white px-3 text-xs outline-none focus:border-[color:var(--c-accent)]" /></div>)}</div></>}
        </div>
        <div className="border-t border-[#dfe5e1] bg-white p-4"><div className="flex items-end justify-between"><div><p className="text-xs font-bold text-[#8a948f]">Toplam</p><p className="mt-1 text-3xl font-black tracking-tight">{formatMoney(total)}</p></div><span className="text-xs font-bold text-[#68736e]">{order.reduce((sum, item) => sum + item.quantity, 0)} ürün</span></div>{feedback && <p role="alert" className="mt-3 rounded-xl bg-[#fff2ed] p-3 text-xs font-bold text-[#9e4328]">{feedback}</p>}<button type="button" onClick={openOrder} disabled={isOpening || order.length === 0 || guestCount < 1} className="mt-4 flex min-h-13 w-full items-center justify-center gap-2 rounded-xl bg-[color:var(--c-accent)] px-5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-45"><ShoppingBag size={18} />{isOpening ? "Sipariş açılıyor…" : "Siparişi aç ve kaydet"}</button></div>
      </div> : <div className="hidden h-[calc(100dvh-76px)] place-items-center p-8 text-center xl:grid"><div><span className="mx-auto grid size-16 place-items-center rounded-2xl bg-[#eef1ef] text-[#7a8580]"><LayoutGridIcon /></span><h2 className="mt-5 text-xl font-black">Bir masa seçin</h2><p className="mt-2 max-w-xs text-sm leading-6 text-[#7a8580]">Ürünleri seçin ve güvenli transaction ile siparişi açın.</p></div></div>}
    </aside>
  </div>;
}

function LayoutGridIcon() {
  return <span className="grid grid-cols-2 gap-1" aria-hidden="true">{[0, 1, 2, 3].map((item) => <span key={item} className="size-3 rounded-[3px] border-2 border-current" />)}</span>;
}
