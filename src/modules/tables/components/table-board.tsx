"use client";

import { useMemo, useState } from "react";
import { Minus, Plus, Search, ShoppingBag, Users, X } from "lucide-react";
import { formatMoney } from "@/lib/money";
import type { MenuProduct } from "@/modules/catalog/types";
import type { OrderLine } from "@/modules/orders/types";
import type { DiningArea, RestaurantTable, TableStatus } from "../types";

const statusMeta: Record<TableStatus, { label: string; dot: string; surface: string; text: string }> = {
  available: { label: "Kullanıma hazır", dot: "bg-[#23866b]", surface: "bg-white", text: "text-[#23866b]" },
  dirty: { label: "Temizlenecek", dot: "bg-[#e3a53b]", surface: "bg-[#fff9e9]", text: "text-[#9a6811]" },
  reserved: { label: "Rezerve", dot: "bg-[#285e9f]", surface: "bg-[#f1f6fb]", text: "text-[#285e9f]" },
  disabled: { label: "Kapalı", dot: "bg-[#9ca5a0]", surface: "bg-[#f1f3f2]", text: "text-[#68736e]" },
};

type TableBoardProps = {
  areas: DiningArea[];
  tables: RestaurantTable[];
  products: MenuProduct[];
};

export function TableBoard({ areas, tables: allTables, products: allProducts }: TableBoardProps) {
  const activeAreas = areas.filter((area) => area.isActive);
  const [areaId, setAreaId] = useState(activeAreas[0]?.id || "");
  const [selected, setSelected] = useState<RestaurantTable | null>(null);
  const [order, setOrder] = useState<OrderLine[]>([]);
  const [query, setQuery] = useState("");

  const tables = allTables.filter((table) => table.areaId === areaId);
  const products = allProducts.filter((product) => product.isActive && product.name.toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR")));
  const total = useMemo(() => order.reduce((sum, item) => sum + item.quantity * item.unitPriceMinor, 0), [order]);

  function addProduct(productId: string) {
    const product = allProducts.find((item) => item.id === productId && item.isActive);
    if (!product) return;
    setOrder((items) => {
      const existing = items.find((item) => item.productId === productId);
      if (existing) return items.map((item) => item.productId === productId ? { ...item, quantity: item.quantity + 1 } : item);
      return [...items, { productId, name: product.name, quantity: 1, unitPriceMinor: product.priceMinor }];
    });
  }

  function changeQuantity(productId: string, delta: number) {
    setOrder((items) => items.map((item) => item.productId === productId ? { ...item, quantity: item.quantity + delta } : item).filter((item) => item.quantity > 0));
  }

  function selectTable(table: RestaurantTable) {
    if (table.status === "disabled") return;
    setSelected(table);
    setOrder([]);
  }

  return <div className="grid min-h-[calc(100dvh-76px)] xl:grid-cols-[1fr_420px]">
    <section className="min-w-0 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-[#e8623a]">Masa yönetimi</p><h1 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">Servis alanları</h1><p className="mt-2 text-sm font-semibold text-[#7a8580]">{allTables.length} masa · {allTables.filter((table) => table.status !== "disabled").length} kullanıma açık · gerçek şube verisi</p></div><div className="flex items-center gap-2 overflow-x-auto pb-1">{activeAreas.map((area) => <button key={area.id} type="button" onClick={() => { setAreaId(area.id); setSelected(null); }} className={`min-h-11 shrink-0 rounded-xl px-5 text-sm font-black transition ${areaId === area.id ? "bg-[#17211d] text-white" : "border border-[#dce3df] bg-white text-[#68736e]"}`}>{area.name}</button>)}</div></div>
      <div className="mt-7 flex flex-wrap gap-4 text-[11px] font-bold text-[#68736e]">{(Object.entries(statusMeta) as [TableStatus, (typeof statusMeta)[TableStatus]][]).map(([key, value]) => <span key={key} className="inline-flex items-center gap-2"><span className={`size-2 rounded-full ${value.dot}`} /> {value.label}</span>)}</div>
      {activeAreas.length === 0 ? <div className="mt-8 rounded-[22px] border border-dashed border-[#cfd7d3] bg-white p-12 text-center"><h2 className="text-xl font-black">Aktif servis alanı yok</h2><p className="mt-2 text-sm text-[#7a8580]">Bir yönetici Ayarlar → Salon & masalar bölümünden alan oluşturmalıdır.</p></div> : <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">{tables.map((table) => { const meta = statusMeta[table.status]; const isSelected = selected?.id === table.id; return <button key={table.id} type="button" disabled={table.status === "disabled"} onClick={() => selectTable(table)} className={`min-h-40 rounded-[22px] border p-4 text-left shadow-[0_8px_24px_rgb(23_33_29/0.04)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-65 ${meta.surface} ${isSelected ? "border-[#e8623a] ring-4 ring-[#fff0ea]" : "border-[#dfe5e1]"}`}><div className="flex items-center justify-between"><span className="text-lg font-black">{table.label}</span><span className={`size-2.5 rounded-full ${meta.dot}`} /></div><p className={`mt-6 text-sm font-black ${meta.text}`}>{meta.label}</p><div className="mt-3 flex items-center gap-1 text-[11px] font-bold text-[#8a948f]"><Users size={13} />{table.capacity} kişi</div><p className="mt-4 truncate text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#a1aaa5]">{table.areaName}</p></button>; })}{tables.length === 0 && <div className="col-span-full rounded-[22px] border border-dashed border-[#cfd7d3] bg-white p-10 text-center text-sm font-semibold text-[#8a948f]">Bu alanda henüz masa bulunmuyor.</div>}</div>}
    </section>
    <aside className={`fixed inset-0 z-50 bg-white transition-transform duration-300 xl:static xl:z-auto xl:block xl:border-l xl:border-[#dfe5e1] ${selected ? "translate-x-0" : "translate-x-full xl:translate-x-0"}`} aria-label="Sipariş taslak paneli">{selected ? <div className="flex h-dvh flex-col xl:h-[calc(100dvh-76px)]"><div className="flex items-center justify-between border-b border-[#e5e9e7] p-5"><div><p className="text-xs font-black uppercase tracking-[0.15em] text-[#e8623a]">Yerel sipariş taslağı</p><h2 className="mt-1 text-2xl font-black">{selected.label} · {selected.areaName}</h2></div><button type="button" onClick={() => setSelected(null)} className="grid size-11 place-items-center rounded-xl bg-[#f0f2f1] text-[#68736e] xl:hidden" aria-label="Paneli kapat"><X size={20} /></button></div><div className="border-b border-[#e5e9e7] p-4"><label className="flex min-h-11 items-center gap-2 rounded-xl bg-[#f1f3f2] px-3"><Search size={17} className="text-[#8a948f]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ürün ara" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label></div><div className="scrollbar-thin flex-1 overflow-y-auto p-4"><p className="mb-3 text-[11px] font-black uppercase tracking-[0.14em] text-[#8a948f]">Aktif ürünler</p><div className="grid grid-cols-2 gap-2">{products.map((product) => <button key={product.id} type="button" onClick={() => addProduct(product.id)} className="min-h-20 rounded-xl border border-[#dfe5e1] bg-white p-3 text-left hover:border-[#e8623a]"><span className="block text-sm font-black leading-5">{product.name}</span><span className="mt-2 block text-xs font-bold text-[#e8623a]">{formatMoney(product.priceMinor)}</span></button>)}{products.length === 0 && <p className="col-span-2 rounded-xl bg-[#f5f7f6] p-5 text-center text-xs font-semibold text-[#8a948f]">Aktif ürün bulunamadı.</p>}</div>{order.length > 0 && <><p className="mb-3 mt-6 text-[11px] font-black uppercase tracking-[0.14em] text-[#8a948f]">Taslak ürünler</p><div className="space-y-2">{order.map((item) => <div key={item.productId} className="flex items-center gap-3 rounded-xl bg-[#f5f7f6] p-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{item.name}</p><p className="mt-1 text-xs font-bold text-[#68736e]">{formatMoney(item.unitPriceMinor * item.quantity)}</p></div><div className="flex items-center rounded-lg border border-[#d9e0dc] bg-white"><button type="button" onClick={() => changeQuantity(item.productId, -1)} className="grid size-9 place-items-center" aria-label={`${item.name} azalt`}><Minus size={14} /></button><span className="w-7 text-center text-xs font-black">{item.quantity}</span><button type="button" onClick={() => changeQuantity(item.productId, 1)} className="grid size-9 place-items-center" aria-label={`${item.name} artır`}><Plus size={14} /></button></div></div>)}</div></>}</div><div className="border-t border-[#dfe5e1] bg-white p-4"><div className="flex items-end justify-between"><div><p className="text-xs font-bold text-[#8a948f]">Taslak toplamı</p><p className="mt-1 text-3xl font-black tracking-tight">{formatMoney(total)}</p></div><span className="text-xs font-bold text-[#68736e]">{order.reduce((sum, item) => sum + item.quantity, 0)} ürün</span></div><button type="button" disabled className="mt-4 flex min-h-13 w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-[#e8623a] px-5 text-sm font-black text-white opacity-45"><ShoppingBag size={18} /> Kalıcı sipariş Modül 5&apos;te</button></div></div> : <div className="hidden h-[calc(100dvh-76px)] place-items-center p-8 text-center xl:grid"><div><span className="mx-auto grid size-16 place-items-center rounded-2xl bg-[#eef1ef] text-[#7a8580]"><LayoutGridIcon /></span><h2 className="mt-5 text-xl font-black">Bir masa seçin</h2><p className="mt-2 max-w-xs text-sm leading-6 text-[#7a8580]">Gerçek menü ürünlerinden yerel sipariş taslağı oluşturun.</p></div></div>}</aside>
  </div>;
}

function LayoutGridIcon() {
  return <span className="grid grid-cols-2 gap-1" aria-hidden="true">{[0, 1, 2, 3].map((item) => <span key={item} className="size-3 rounded-[3px] border-2 border-current" />)}</span>;
}
