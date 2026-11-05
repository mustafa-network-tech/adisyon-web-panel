"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Layers, Plus, Trash2 } from "lucide-react";
import { deleteOptionGroupAction, saveOptionGroupAction, setOptionChoiceAvailabilityAction } from "../option-actions";
import { formatDelta, groupRuleText, optionKindLabels, parsePriceDelta, type OptionKind } from "../options";
import type { MenuProduct, OptionGroupAdmin } from "../types";

type Props = {
  tenant: string;
  branch: string;
  groups: OptionGroupAdmin[];
  products: MenuProduct[];
  canAvailability: boolean;
};

type DraftChoice = { key: string; id: string; name: string; price: string; isActive: boolean; soldOut: boolean };
type Draft = {
  id: string;
  name: string;
  kind: OptionKind;
  required: boolean;
  maxSelect: string;
  isActive: boolean;
  choices: DraftChoice[];
  productIds: string[];
};

const inputClass = "min-h-11 w-full rounded-xl border border-[#dce3df] bg-[#f9faf9] px-3 text-sm outline-none focus:border-[#e8623a] focus:bg-white";
const labelClass = "mb-2 block text-xs font-bold text-[#68736e]";
let keyCounter = 0;
const nextKey = () => `new-${(keyCounter += 1)}`;

function emptyDraft(): Draft {
  return { id: "", name: "", kind: "variant", required: true, maxSelect: "", isActive: true, choices: [{ key: nextKey(), id: "", name: "", price: "", isActive: true, soldOut: false }], productIds: [] };
}

function toDraft(group: OptionGroupAdmin): Draft {
  return {
    id: group.id,
    name: group.name,
    kind: group.kind,
    required: group.minSelect > 0,
    maxSelect: group.kind === "variant" || group.maxSelect === null ? "" : String(group.maxSelect),
    isActive: group.isActive,
    choices: group.choices.map((choice) => ({
      key: choice.id,
      id: choice.id,
      name: choice.name,
      price: choice.priceDeltaMinor === 0 ? "" : (choice.priceDeltaMinor / 100).toFixed(2).replace(".", ","),
      isActive: choice.isActive,
      soldOut: choice.soldOut,
    })),
    productIds: group.productIds,
  };
}

export function OptionManager({ tenant, branch, groups, products, canAvailability }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [feedback, setFeedback] = useState<{ type: "error" | "success"; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const productsByCategory = useMemo(() => {
    const map = new Map<string, MenuProduct[]>();
    for (const product of products) map.set(product.categoryName, [...(map.get(product.categoryName) || []), product]);
    return [...map.entries()];
  }, [products]);

  function update(patch: Partial<Draft>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }

  function updateChoice(key: string, patch: Partial<DraftChoice>) {
    setDraft((current) => current && { ...current, choices: current.choices.map((choice) => (choice.key === key ? { ...choice, ...patch } : choice)) });
  }

  function toggleProducts(ids: string[], on: boolean) {
    setDraft((current) => {
      if (!current) return current;
      const rest = current.productIds.filter((id) => !ids.includes(id));
      return { ...current, productIds: on ? [...rest, ...ids] : rest };
    });
  }

  function save() {
    if (!draft) return;
    const choices: { id: string; name: string; priceDeltaMinor: number; isActive: boolean }[] = [];
    for (const choice of draft.choices.filter((item) => item.name.trim() !== "")) {
      const price = draft.kind === "removal" ? 0 : parsePriceDelta(choice.price);
      if (price === undefined) {
        setFeedback({ type: "error", message: `“${choice.name}” için fiyat farkını 15 veya -100 gibi girin.` });
        return;
      }
      choices.push({ id: choice.id, name: choice.name.trim(), priceDeltaMinor: price, isActive: choice.isActive });
    }
    const max = draft.maxSelect.trim() === "" ? null : Number(draft.maxSelect);
    if (max !== null && (!Number.isInteger(max) || max < 1 || max > 30)) {
      setFeedback({ type: "error", message: "En fazla seçim sayısını 1–30 arasında girin ya da boş bırakın." });
      return;
    }
    setFeedback(null);
    startTransition(async () => {
      const result = await saveOptionGroupAction({
        tenant, branch, groupId: draft.id, name: draft.name, kind: draft.kind, required: draft.required,
        maxSelect: draft.kind === "variant" ? null : max, isActive: draft.isActive, choices, productIds: draft.productIds,
      });
      setFeedback({ type: result.ok ? "success" : "error", message: result.message });
      if (result.ok) {
        setDraft(null);
        router.refresh();
      }
    });
  }

  function remove() {
    if (!draft?.id || !window.confirm(`“${draft.name}” grubu silinsin mi? Geçmiş siparişler etkilenmez.`)) return;
    startTransition(async () => {
      const result = await deleteOptionGroupAction({ tenant, branch, groupId: draft.id });
      setFeedback({ type: result.ok ? "success" : "error", message: result.message });
      if (result.ok) {
        setDraft(null);
        router.refresh();
      }
    });
  }

  function toggleSoldOut(choice: DraftChoice) {
    startTransition(async () => {
      const result = await setOptionChoiceAvailabilityAction({ tenant, branch, choiceId: choice.id, soldOut: !choice.soldOut });
      setFeedback({ type: result.ok ? "success" : "error", message: result.message });
      if (result.ok) updateChoice(choice.key, { soldOut: !choice.soldOut });
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
      <aside className="rounded-[22px] border border-[#dfe5e1] bg-white p-4">
        <div className="flex items-center justify-between px-1">
          <h2 className="flex items-center gap-2 text-sm font-black"><Layers size={16} />Seçenek grupları</h2>
          <button type="button" onClick={() => { setDraft(emptyDraft()); setFeedback(null); }} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[#e8623a] px-3 text-xs font-black text-white"><Plus size={14} />Yeni grup</button>
        </div>
        <ul className="mt-3 space-y-2">
          {groups.map((group) => (
            <li key={group.id}>
              <button type="button" onClick={() => { setDraft(toDraft(group)); setFeedback(null); }} className={`w-full rounded-xl p-3 text-left ${draft?.id === group.id ? "bg-[#17211d] text-white" : "bg-[#f6f8f7]"}`}>
                <span className="block text-sm font-black">{group.name}{!group.isActive && " (pasif)"}</span>
                <span className={`mt-0.5 block text-[11px] font-semibold ${draft?.id === group.id ? "text-white/65" : "text-[#8a948f]"}`}>
                  {optionKindLabels[group.kind]} · {groupRuleText(group)} · {group.choices.length} seçenek · {group.productIds.length} ürün
                </span>
              </button>
            </li>
          ))}
          {groups.length === 0 && <li className="px-2 py-8 text-center text-xs font-semibold leading-5 text-[#8a948f]">Henüz seçenek grubu yok. Örn. “Porsiyon”, “Ekstralar”, “Çıkar”.</li>}
        </ul>
      </aside>

      <section>
        {!draft && <div className="grid min-h-60 place-items-center rounded-[22px] border border-dashed border-[#cdd5d1] p-10 text-center text-sm font-semibold leading-6 text-[#8a948f]">Soldan bir grup seçin ya da yeni grup ekleyin.<br />Grup bir kez tanımlanır, istediğiniz ürünlere bağlanır.</div>}
        {draft && (
          <div className="space-y-5 rounded-[22px] border border-[#dfe5e1] bg-white p-5 sm:p-6">
            <h2 className="text-xl font-black">{draft.id ? "Grubu düzenle" : "Yeni seçenek grubu"}</h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <label><span className={labelClass}>Grup adı</span><input className={inputClass} value={draft.name} onChange={(event) => update({ name: event.target.value })} maxLength={60} placeholder="Porsiyon, Ekstralar, Çıkar…" /></label>
              <label><span className={labelClass}>Tür</span>
                <select className={inputClass} value={draft.kind} onChange={(event) => { const kind = event.target.value as OptionKind; update({ kind, required: kind === "variant" ? true : false }); }}>
                  {(Object.keys(optionKindLabels) as OptionKind[]).map((kind) => <option key={kind} value={kind}>{optionKindLabels[kind]}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-3 rounded-xl bg-[#f6f8f7] p-3 text-sm font-bold"><input type="checkbox" checked={draft.required} onChange={(event) => update({ required: event.target.checked })} className="size-5" />Seçim zorunlu</label>
              {draft.kind !== "variant" && <label><span className={labelClass}>En fazla seçim (boş = sınırsız)</span><input className={inputClass} inputMode="numeric" value={draft.maxSelect} onChange={(event) => update({ maxSelect: event.target.value })} placeholder="Örn. 3" /></label>}
              <label className="flex items-center gap-3 rounded-xl bg-[#f6f8f7] p-3 text-sm font-bold"><input type="checkbox" checked={draft.isActive} onChange={(event) => update({ isActive: event.target.checked })} className="size-5" />Grup aktif</label>
            </div>

            <div>
              <h3 className="text-sm font-black">Seçenekler</h3>
              <p className="mt-1 text-xs font-semibold leading-5 text-[#8a948f]">
                {draft.kind === "variant" && "Fiyat farkı: tam porsiyon 0 (boş), yarım porsiyon için -100 gibi eksi değer girebilirsiniz."}
                {draft.kind === "extra" && "Fiyat farkı: ekstranın ürüne eklediği tutar (örn. 15)."}
                {draft.kind === "removal" && "Çıkarılacak malzemenin adını yazın (örn. Soğan). Fişte “Çıkar: Soğan” görünür; ücretsizdir."}
              </p>
              <ul className="mt-3 space-y-2">
                {draft.choices.map((choice) => (
                  <li key={choice.key} className="grid items-center gap-2 rounded-xl bg-[#f6f8f7] p-2 sm:grid-cols-[1fr_130px_auto]">
                    <input aria-label="Seçenek adı" className={inputClass} value={choice.name} onChange={(event) => updateChoice(choice.key, { name: event.target.value })} maxLength={60} placeholder="Seçenek adı" />
                    {draft.kind === "removal" ? <span className="px-2 text-xs font-bold text-[#8a948f]">Ücretsiz</span> : <input aria-label="Fiyat farkı" className={inputClass} inputMode="decimal" value={choice.price} onChange={(event) => updateChoice(choice.key, { price: event.target.value })} placeholder="Fiyat farkı ₺" />}
                    <div className="flex items-center gap-1.5">
                      <label className="flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-xs font-bold"><input type="checkbox" checked={choice.isActive} onChange={(event) => updateChoice(choice.key, { isActive: event.target.checked })} className="size-4" />Aktif</label>
                      {canAvailability && choice.id && <button type="button" onClick={() => toggleSoldOut(choice)} disabled={isPending} className={`min-h-10 rounded-lg border px-2 text-[11px] font-black ${choice.soldOut ? "border-[#f0c6bb] bg-[#fff0ee] text-[#b63b32]" : "border-[#dce3df] bg-white"}`}>{choice.soldOut ? "Tükendi · aç" : "Bugün tükendi"}</button>}
                      <button type="button" onClick={() => setDraft((current) => current && { ...current, choices: current.choices.filter((item) => item.key !== choice.key) })} className="grid size-10 place-items-center rounded-lg border border-[#f0c6bb] text-[#b63b32]" aria-label="Seçeneği sil"><Trash2 size={15} /></button>
                    </div>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => setDraft((current) => current && { ...current, choices: [...current.choices, { key: nextKey(), id: "", name: "", price: "", isActive: true, soldOut: false }] })} className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#dce3df] px-3 text-xs font-black"><Plus size={14} />Seçenek ekle</button>
              {draft.choices.some((choice) => choice.price && choice.price !== "" && parsePriceDelta(choice.price) !== undefined && parsePriceDelta(choice.price) !== 0) && (
                <p className="mt-2 text-[11px] font-semibold text-[#8a948f]">Örnek: {draft.choices.filter((choice) => choice.name && parsePriceDelta(choice.price)).slice(0, 3).map((choice) => `${choice.name} ${formatDelta(parsePriceDelta(choice.price) || 0)}`).join(" · ")}</p>
              )}
            </div>

            <div>
              <h3 className="text-sm font-black">Hangi ürünlerde görünsün?</h3>
              <div className="mt-3 max-h-72 space-y-4 overflow-y-auto rounded-xl border border-[#edf0ee] p-3">
                {productsByCategory.map(([category, items]) => {
                  const ids = items.map((item) => item.id);
                  const allOn = ids.every((id) => draft.productIds.includes(id));
                  return (
                    <div key={category}>
                      <label className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.08em] text-[#68736e]"><input type="checkbox" checked={allOn} onChange={(event) => toggleProducts(ids, event.target.checked)} className="size-4" />{category} (tümü)</label>
                      <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                        {items.map((product) => (
                          <li key={product.id}><label className="flex items-center gap-2 rounded-lg bg-[#f6f8f7] px-3 py-2 text-sm font-bold"><input type="checkbox" checked={draft.productIds.includes(product.id)} onChange={(event) => toggleProducts([product.id], event.target.checked)} className="size-4" />{product.name}</label></li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
                {products.length === 0 && <p className="text-xs font-semibold text-[#8a948f]">Önce Menü ve ürünler bölümünden ürün ekleyin.</p>}
              </div>
            </div>

            {feedback && <p role={feedback.type === "error" ? "alert" : "status"} className={`rounded-xl p-3 text-xs font-semibold ${feedback.type === "error" ? "bg-[#fff7f3] text-[#9e4328]" : "bg-[#edf8f3] text-[#176e56]"}`}>{feedback.message}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={save} disabled={isPending} className="min-h-11 rounded-xl bg-[#e8623a] px-6 text-sm font-black text-white disabled:opacity-50">{isPending ? "Kaydediliyor…" : "Grubu kaydet"}</button>
              <button type="button" onClick={() => { setDraft(null); setFeedback(null); }} className="min-h-11 rounded-xl border border-[#dce3df] px-4 text-sm font-bold">Vazgeç</button>
              {draft.id && <button type="button" onClick={remove} disabled={isPending} className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#f0c6bb] px-4 text-sm font-black text-[#b63b32] disabled:opacity-50"><Trash2 size={15} />Grubu sil</button>}
            </div>
          </div>
        )}
        {!draft && feedback && <p role={feedback.type === "error" ? "alert" : "status"} className={`mt-4 rounded-xl p-3 text-xs font-semibold ${feedback.type === "error" ? "bg-[#fff7f3] text-[#9e4328]" : "bg-[#edf8f3] text-[#176e56]"}`}>{feedback.message}</p>}
      </section>
    </div>
  );
}
