"use client";

import { useMemo, useState } from "react";
import { PackageX } from "lucide-react";
import type { MenuProduct } from "../types";
import { AvailabilityToggle } from "./availability-toggle";

/** Quick sold-out list for the kitchen screen: search a product, tap once. */
export function AvailabilityPanel({ tenant, branch, products }: { tenant: string; branch: string; products: MenuProduct[] }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const soldOutCount = products.filter((product) => product.soldOut).length;
  const visible = useMemo(() => {
    const text = query.trim().toLocaleLowerCase("tr-TR");
    return products.filter((product) => product.isActive && (!text || product.name.toLocaleLowerCase("tr-TR").includes(text)));
  }, [products, query]);

  return (
    <section className="mt-6 rounded-[22px] border border-[#dfe5e1] bg-white p-4 sm:p-5">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex w-full items-center gap-3 text-left">
        <span className="grid size-10 place-items-center rounded-xl bg-[#fff0ee] text-[#b63b32]"><PackageX size={19} /></span>
        <span className="flex-1">
          <span className="block text-base font-black">Ürün durumu</span>
          <span className="block text-xs font-semibold text-[#8a948f]">{soldOutCount > 0 ? `${soldOutCount} ürün bugün tükendi` : "Biten ürünü buradan işaretleyin; yarın kendiliğinden açılır."}</span>
        </span>
        <span className="text-xs font-black text-[#68736e]">{open ? "Gizle" : "Aç"}</span>
      </button>
      {open && (
        <div className="mt-4">
          <label className="block"><span className="sr-only">Ürün ara</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ürün ara…" className="min-h-11 w-full rounded-xl border border-[#dce3df] bg-[#f9faf9] px-3 text-sm outline-none focus:border-[color:var(--c-accent)]" /></label>
          <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto">
            {visible.map((product) => (
              <li key={product.id} className={`flex items-center gap-3 rounded-xl p-3 ${product.soldOut ? "bg-[#fff8f6]" : "bg-[#f6f8f7]"}`}>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-black">{product.name}</span><span className="block truncate text-[11px] font-semibold text-[#8a948f]">{product.categoryName}</span></span>
                <AvailabilityToggle tenant={tenant} branch={branch} productId={product.id} productName={product.name} soldOut={product.soldOut} />
              </li>
            ))}
            {visible.length === 0 && <li className="py-6 text-center text-xs font-semibold text-[#8a948f]">Ürün bulunamadı.</li>}
          </ul>
        </div>
      )}
    </section>
  );
}
