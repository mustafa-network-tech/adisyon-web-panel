"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChefHat, Plus } from "lucide-react";
import type { KitchenStationOption, MenuCategory, MenuProduct } from "@/modules/catalog/types";
import { isLimitReached, limitReachedMessage, usageText, type PlanUsage } from "@/modules/plan/usage";
import { saveKitchenStationAction } from "../actions";
import { stationColors, stationSuggestions } from "../validation";

type Props = {
  tenant: string;
  branch: string;
  stations: KitchenStationOption[];
  products: MenuProduct[];
  categories: MenuCategory[];
  usage: PlanUsage | null;
};

type Draft = { id: string; name: string; color: string; isActive: boolean; productIds: string[] };

const inputClass = "min-h-11 w-full rounded-xl border border-[#dce3df] bg-[#f9faf9] px-3 text-sm outline-none focus:border-[#e8623a] focus:bg-white";
const labelClass = "mb-2 block text-xs font-bold text-[#68736e]";

export function StationManager({ tenant, branch, stations, products, categories, usage }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [feedback, setFeedback] = useState<{ type: "error" | "success"; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Items served without the kitchen (water, soda...) never use a station.
  const routedProducts = useMemo(() => {
    const direct = new Set(categories.filter((category) => category.fulfillment === "direct").map((category) => category.id));
    return products.filter((product) => (product.fulfillment ?? (direct.has(product.categoryId) ? "direct" : "kitchen")) === "kitchen");
  }, [products, categories]);
  const byCategory = useMemo(() => {
    const map = new Map<string, MenuProduct[]>();
    for (const product of routedProducts) map.set(product.categoryName, [...(map.get(product.categoryName) || []), product]);
    return [...map.entries()];
  }, [routedProducts]);
  const stationName = (id: string | null) => stations.find((station) => station.id === id)?.name;
  const limitHit = usage ? isLimitReached(usage.stationsUsed, usage.stationLimit) : false;

  function open(station: KitchenStationOption | null) {
    setFeedback(null);
    setDraft(station
      ? { id: station.id, name: station.name, color: station.color, isActive: station.isActive, productIds: routedProducts.filter((product) => product.kitchenStationId === station.id).map((product) => product.id) }
      : { id: "", name: "", color: stationColors[stations.length % stationColors.length], isActive: true, productIds: [] });
  }

  function toggle(ids: string[], on: boolean) {
    setDraft((current) => current && { ...current, productIds: on ? [...new Set([...current.productIds, ...ids])] : current.productIds.filter((id) => !ids.includes(id)) });
  }

  function save() {
    if (!draft) return;
    setFeedback(null);
    startTransition(async () => {
      const result = await saveKitchenStationAction({ tenant, branch, stationId: draft.id, name: draft.name, color: draft.color, isActive: draft.isActive, productIds: draft.productIds });
      setFeedback({ type: result.ok ? "success" : "error", message: result.message });
      if (result.ok) {
        setDraft(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-5">
      {usage && (
        <p className={`rounded-2xl p-4 text-sm font-bold ${limitHit ? "bg-[#fff8e7] text-[#8a6415]" : "bg-[#f1f6f3] text-[#2f4f43]"}`}>
          İstasyon: {usageText(usage.stationsUsed, usage.stationLimit)}
          {limitHit && <span className="mt-1 block text-xs font-semibold">{limitReachedMessage("station", usage.stationLimit)}</span>}
        </p>
      )}
      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <aside className="rounded-[22px] border border-[#dfe5e1] bg-white p-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="flex items-center gap-2 text-sm font-black"><ChefHat size={16} />İstasyonlar</h2>
            <button type="button" onClick={() => open(null)} disabled={limitHit} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[#e8623a] px-3 text-xs font-black text-white disabled:opacity-45"><Plus size={14} />Yeni</button>
          </div>
          <ul className="mt-3 space-y-2">
            {stations.map((station) => {
              const count = routedProducts.filter((product) => product.kitchenStationId === station.id).length;
              return (
                <li key={station.id}>
                  <button type="button" onClick={() => open(station)} className={`flex w-full items-center gap-3 rounded-xl p-3 text-left ${draft?.id === station.id ? "bg-[#17211d] text-white" : "bg-[#f6f8f7]"}`}>
                    <span className="size-3.5 shrink-0 rounded-full" style={{ backgroundColor: station.color }} />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-black">{station.name}{!station.isActive && " (pasif)"}</span><span className={`block text-[11px] font-semibold ${draft?.id === station.id ? "text-white/65" : "text-[#8a948f]"}`}>{count} ürün</span></span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 px-1 text-[11px] font-semibold leading-5 text-[#8a948f]">Yalnızca mutfağınız varsa tek istasyonla devam edebilirsiniz. Izgara, fırın gibi ayrı bölümler için istasyon ekleyin; siparişler ürünün istasyonuna göre ayrı fişlerle düşer.</p>
        </aside>

        <section>
          {!draft && <div className="grid min-h-56 place-items-center rounded-[22px] border border-dashed border-[#cdd5d1] p-10 text-center text-sm font-semibold leading-6 text-[#8a948f]">Soldan bir istasyon seçin ya da yeni istasyon ekleyin.</div>}
          {draft && (
            <div className="space-y-5 rounded-[22px] border border-[#dfe5e1] bg-white p-5 sm:p-6">
              <h2 className="text-xl font-black">{draft.id ? "İstasyonu düzenle" : "Yeni istasyon"}</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label><span className={labelClass}>İstasyon adı</span><input className={inputClass} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} maxLength={40} placeholder="Örn. Izgara" /></label>
                  {!draft.id && <div className="mt-2 flex flex-wrap gap-1.5">{stationSuggestions.filter((name) => !stations.some((station) => station.name.toLocaleLowerCase("tr-TR") === name.toLocaleLowerCase("tr-TR"))).map((name) => <button key={name} type="button" onClick={() => setDraft({ ...draft, name })} className="min-h-8 rounded-lg border border-[#dce3df] px-2.5 text-xs font-bold">{name}</button>)}</div>}
                </div>
                <fieldset>
                  <legend className={labelClass}>Renk</legend>
                  <div className="flex flex-wrap gap-2">
                    {stationColors.map((color) => <button key={color} type="button" onClick={() => setDraft({ ...draft, color })} aria-pressed={draft.color === color} aria-label={`Renk ${color}`} className={`size-9 rounded-full border-2 ${draft.color === color ? "border-[#17211d]" : "border-transparent"}`} style={{ backgroundColor: color }} />)}
                  </div>
                </fieldset>
                <label className="flex items-center gap-3 rounded-xl bg-[#f6f8f7] p-3 text-sm font-bold sm:col-span-2"><input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })} className="size-5" />İstasyon aktif<span className="text-xs font-semibold text-[#8a948f]">(kapatırsanız ürünleri başka bir istasyona geçer)</span></label>
              </div>

              <div>
                <h3 className="text-sm font-black">Bu istasyonda hazırlanan ürünler</h3>
                <p className="mt-1 text-xs font-semibold leading-5 text-[#8a948f]">İşaretlediğiniz ürünler bu istasyona taşınır; işaretini kaldırdıklarınız diğer istasyona döner. Su, kola gibi “doğrudan servis” ürünleri listede yoktur.</p>
                <div className="mt-3 max-h-80 space-y-4 overflow-y-auto rounded-xl border border-[#edf0ee] p-3">
                  {byCategory.map(([category, items]) => {
                    const ids = items.map((item) => item.id);
                    return (
                      <div key={category}>
                        <label className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.08em] text-[#68736e]"><input type="checkbox" checked={ids.every((id) => draft.productIds.includes(id))} onChange={(event) => toggle(ids, event.target.checked)} className="size-4" />{category} (tümü)</label>
                        <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                          {items.map((product) => (
                            <li key={product.id}><label className="flex items-center gap-2 rounded-lg bg-[#f6f8f7] px-3 py-2 text-sm font-bold"><input type="checkbox" checked={draft.productIds.includes(product.id)} onChange={(event) => toggle([product.id], event.target.checked)} className="size-4" /><span className="min-w-0 flex-1 truncate">{product.name}</span>{product.kitchenStationId && product.kitchenStationId !== draft.id && !draft.productIds.includes(product.id) && <span className="shrink-0 text-[10px] font-semibold text-[#8a948f]">{stationName(product.kitchenStationId)}</span>}</label></li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                  {routedProducts.length === 0 && <p className="text-xs font-semibold text-[#8a948f]">Önce Menü ve ürünler bölümünden ürün ekleyin.</p>}
                </div>
              </div>

              {feedback && <p role={feedback.type === "error" ? "alert" : "status"} className={`rounded-xl p-3 text-xs font-semibold ${feedback.type === "error" ? "bg-[#fff7f3] text-[#9e4328]" : "bg-[#edf8f3] text-[#176e56]"}`}>{feedback.message}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={save} disabled={isPending} className="min-h-11 rounded-xl bg-[#e8623a] px-6 text-sm font-black text-white disabled:opacity-50">{isPending ? "Kaydediliyor…" : "İstasyonu kaydet"}</button>
                <button type="button" onClick={() => { setDraft(null); setFeedback(null); }} className="min-h-11 rounded-xl border border-[#dce3df] px-4 text-sm font-bold">Vazgeç</button>
              </div>
            </div>
          )}
          {!draft && feedback && <p role={feedback.type === "error" ? "alert" : "status"} className={`mt-4 rounded-xl p-3 text-xs font-semibold ${feedback.type === "error" ? "bg-[#fff7f3] text-[#9e4328]" : "bg-[#edf8f3] text-[#176e56]"}`}>{feedback.message}</p>}
        </section>
      </div>
    </div>
  );
}
