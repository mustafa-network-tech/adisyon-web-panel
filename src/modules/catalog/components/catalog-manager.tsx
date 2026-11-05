"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, Pencil, Plus, Tags, UtensilsCrossed } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { initialCrudActionState } from "@/modules/settings/action-state";
import { upsertCategoryAction, upsertProductAction } from "../actions";
import { AvailabilityToggle } from "./availability-toggle";
import type { CatalogSnapshot, MenuCategory, MenuProduct } from "../types";

type CatalogManagerProps = CatalogSnapshot & { tenant: string; branch: string; canAvailability?: boolean };

const fulfillmentLabel = { kitchen: "Mutfak", direct: "Doğrudan servis" } as const;

const inputClass = "min-h-11 w-full rounded-xl border border-[#dce3df] bg-[#f9faf9] px-3 text-sm outline-none focus:border-[#e8623a] focus:bg-white";

function effectiveFulfillment(product: MenuProduct, categories: MenuCategory[]) {
  return product.fulfillment || categories.find((category) => category.id === product.categoryId)?.fulfillment || "kitchen";
}

export function CatalogManager({ tenant, branch, categories, products, kitchenStations, canAvailability = false }: CatalogManagerProps) {
  const [editingCategory, setEditingCategory] = useState<MenuCategory | null>(null);
  const [editingProduct, setEditingProduct] = useState<MenuProduct | null>(null);
  const [categoryState, categoryAction, categoryPending] = useActionState(upsertCategoryAction, initialCrudActionState);
  const [productState, productAction, productPending] = useActionState(upsertProductAction, initialCrudActionState);

  return (
    <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
      <aside className="space-y-5">
        <form key={editingCategory?.id || "new-category"} action={categoryAction} className="rounded-[22px] border border-[#dfe5e1] bg-white p-5">
          <input type="hidden" name="tenant" value={tenant} /><input type="hidden" name="branch" value={branch} /><input type="hidden" name="id" value={editingCategory?.id || ""} />
          <div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[0.14em] text-[#e8623a]">Kategori</p><h2 className="mt-1 text-xl font-black">{editingCategory ? "Kategoriyi düzenle" : "Yeni kategori"}</h2></div><Tags size={22} className="text-[#8a948f]" /></div>
          <label className="mt-5 block"><span className="mb-2 block text-xs font-bold text-[#68736e]">Kategori adı</span><input className={inputClass} name="name" defaultValue={editingCategory?.name} required minLength={2} maxLength={80} /></label>
          <label className="mt-3 block"><span className="mb-2 block text-xs font-bold text-[#68736e]">Hazırlık yeri</span><select className={inputClass} name="fulfillment" defaultValue={editingCategory?.fulfillment || "kitchen"}><option value="kitchen">Mutfak (fiş ve ekran)</option><option value="direct">Doğrudan servis (mutfağa gitmez)</option></select><span className="mt-1 block text-[11px] font-semibold text-[#8a948f]">Su, kola gibi ürünler için doğrudan servisi seçin.</span></label>
          <label className="mt-3 block"><span className="mb-2 block text-xs font-bold text-[#68736e]">Durum</span><select className={inputClass} name="isActive" defaultValue={String(editingCategory?.isActive ?? true)}><option value="true">Aktif</option><option value="false">Pasif</option></select></label>
          {categoryState.message && <p role={categoryState.status === "error" ? "alert" : "status"} className={`mt-3 rounded-xl p-3 text-xs font-semibold ${categoryState.status === "error" ? "bg-[#fff7f3] text-[#9e4328]" : "bg-[#edf8f3] text-[#176e56]"}`}>{categoryState.message}</p>}
          <div className="mt-4 flex gap-2"><button disabled={categoryPending} className="min-h-11 flex-1 rounded-xl bg-[#17211d] px-4 text-sm font-black text-white disabled:opacity-50">{categoryPending ? "Kaydediliyor…" : "Kaydet"}</button>{editingCategory && <button type="button" onClick={() => setEditingCategory(null)} className="min-h-11 rounded-xl border border-[#dce3df] px-4 text-sm font-bold">Vazgeç</button>}</div>
        </form>

        <div className="rounded-[22px] border border-[#dfe5e1] bg-white p-4"><div className="flex items-center justify-between px-1"><h2 className="text-sm font-black">Kategoriler</h2><span className="text-xs font-bold text-[#8a948f]">{categories.length}</span></div><div className="mt-3 space-y-2">{categories.map((category) => <button key={category.id} type="button" onClick={() => setEditingCategory(category)} className="flex min-h-11 w-full items-center gap-3 rounded-xl bg-[#f6f8f7] px-3 text-left"><span className={`size-2 rounded-full ${category.isActive ? "bg-[#23866b]" : "bg-[#a7afab]"}`} /><span className="min-w-0 flex-1 truncate text-sm font-bold">{category.name}</span>{category.fulfillment === "direct" && <span className="rounded-md bg-[#eaf2fb] px-2 py-0.5 text-[10px] font-black text-[#285e9f]">Doğrudan</span>}<Pencil size={14} className="text-[#8a948f]" /></button>)}{categories.length === 0 && <p className="px-2 py-5 text-center text-xs font-semibold text-[#8a948f]">Henüz kategori yok.</p>}</div></div>
      </aside>

      <section className="space-y-5">
        <form key={editingProduct?.id || "new-product"} action={productAction} className="rounded-[22px] border border-[#dfe5e1] bg-white p-5 sm:p-6">
          <input type="hidden" name="tenant" value={tenant} /><input type="hidden" name="branch" value={branch} /><input type="hidden" name="id" value={editingProduct?.id || ""} />
          <div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[0.14em] text-[#e8623a]">Ürün</p><h2 className="mt-1 text-xl font-black">{editingProduct ? "Ürünü düzenle" : "Yeni ürün"}</h2></div><UtensilsCrossed size={23} className="text-[#8a948f]" /></div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label><span className="mb-2 block text-xs font-bold text-[#68736e]">Ürün adı</span><input className={inputClass} name="name" defaultValue={editingProduct?.name} required maxLength={120} /></label>
            <label><span className="mb-2 block text-xs font-bold text-[#68736e]">Kategori</span><select className={inputClass} name="categoryId" defaultValue={editingProduct?.categoryId || ""} required><option value="" disabled>Kategori seçin</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}{category.isActive ? "" : " (Pasif)"}</option>)}</select></label>
            <label><span className="mb-2 block text-xs font-bold text-[#68736e]">Fiyat (₺)</span><input className={inputClass} name="price" inputMode="decimal" defaultValue={editingProduct ? (editingProduct.priceMinor / 100).toFixed(2).replace(".", ",") : ""} placeholder="125,50" required /></label>
            <label><span className="mb-2 block text-xs font-bold text-[#68736e]">KDV (%)</span><input className={inputClass} name="taxRate" type="number" min="0" max="100" step="0.01" defaultValue={editingProduct?.taxRate ?? 10} required /></label>
            <label><span className="mb-2 block text-xs font-bold text-[#68736e]">Hazırlık yeri</span><select className={inputClass} name="fulfillment" defaultValue={editingProduct?.fulfillment || ""}><option value="">Kategoriyi izle</option><option value="kitchen">Mutfak</option><option value="direct">Doğrudan servis</option></select></label>
            <label><span className="mb-2 block text-xs font-bold text-[#68736e]">Mutfak istasyonu</span><select className={inputClass} name="kitchenStationId" defaultValue={editingProduct?.kitchenStationId || ""}><option value="">Atanmamış</option>{kitchenStations.map((station) => <option key={station.id} value={station.id}>{station.name}{station.isActive ? "" : " (Pasif)"}</option>)}</select></label>
            <label><span className="mb-2 block text-xs font-bold text-[#68736e]">Durum</span><select className={inputClass} name="isActive" defaultValue={String(editingProduct?.isActive ?? true)}><option value="true">Aktif</option><option value="false">Pasif</option></select></label>
            <label className="sm:col-span-2"><span className="mb-2 block text-xs font-bold text-[#68736e]">Açıklama</span><textarea className={`${inputClass} min-h-24 py-3`} name="description" defaultValue={editingProduct?.description || ""} maxLength={500} /></label>
          </div>
          {productState.message && <p role={productState.status === "error" ? "alert" : "status"} className={`mt-4 rounded-xl p-3 text-xs font-semibold ${productState.status === "error" ? "bg-[#fff7f3] text-[#9e4328]" : "bg-[#edf8f3] text-[#176e56]"}`}>{productState.message}</p>}
          <div className="mt-4 flex gap-2"><button disabled={productPending || categories.length === 0} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#e8623a] px-5 text-sm font-black text-white disabled:opacity-50"><Plus size={16} />{productPending ? "Kaydediliyor…" : "Ürünü kaydet"}</button>{editingProduct && <button type="button" onClick={() => setEditingProduct(null)} className="min-h-11 rounded-xl border border-[#dce3df] px-4 text-sm font-bold">Vazgeç</button>}</div>
        </form>

        <div className="overflow-hidden rounded-[22px] border border-[#dfe5e1] bg-white"><div className="border-b border-[#e8ecea] p-5"><h2 className="text-lg font-black">Ürünler</h2><p className="mt-1 text-xs font-semibold text-[#8a948f]">{products.length} kayıt</p></div><div className="divide-y divide-[#edf0ee]">{products.map((product) => <div key={product.id} className="flex items-center hover:bg-[#fafbfa]"><button type="button" onClick={() => setEditingProduct(product)} className="grid min-w-0 flex-1 gap-2 p-4 text-left sm:grid-cols-[1fr_150px_120px_auto] sm:items-center"><div><p className="text-sm font-black">{product.name}</p><p className="mt-1 text-xs font-semibold text-[#8a948f]">{product.categoryName} · {effectiveFulfillment(product, categories) === "direct" ? fulfillmentLabel.direct : product.kitchenStationName || "İstasyon yok"}</p></div><p className="text-sm font-black text-[#e8623a]">{formatMoney(product.priceMinor)}</p><span className={`w-fit rounded-lg px-2.5 py-1 text-[10px] font-black ${product.isActive ? "bg-[#e7f5ef] text-[#176e56]" : "bg-[#eef0ef] text-[#68736e]"}`}>{product.isActive ? "Aktif" : "Pasif"}</span><span className="flex items-center gap-1 text-xs font-bold text-[#68736e]"><Pencil size={14} /> Düzenle</span></button>{canAvailability && <div className="pr-4"><AvailabilityToggle tenant={tenant} branch={branch} productId={product.id} productName={product.name} soldOut={product.soldOut} /></div>}</div>)}{products.length === 0 && <div className="p-10 text-center"><CheckCircle2 className="mx-auto text-[#a7afab]" /><p className="mt-3 text-sm font-semibold text-[#8a948f]">Henüz ürün eklenmedi.</p></div>}</div></div>
      </section>
    </div>
  );
}
