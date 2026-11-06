import { formatMoney } from "@/lib/money";
import { startingPriceMinor } from "@/modules/catalog/options";
import type { PublicMenu } from "../types";

/**
 * The QR menu is a menu only: guests look at categories, products and prices (KDV included) and can call
 * the waiter. Orders are taken by the waiter; there is no cart and no way to order from the phone.
 */
export function PublicMenuView({ menu }: { menu: PublicMenu }) {
  return (
    <>
      <nav
        aria-label="Kategoriler"
        className="sticky top-0 z-10 -mx-4 flex gap-2 overflow-x-auto border-b border-[#dfe5e1] bg-[#f4f6f8]/95 px-4 py-3 backdrop-blur"
      >
        {menu.categories.map((category) => (
          <a
            key={category.id}
            href={`#kategori-${category.id}`}
            className="shrink-0 rounded-full border border-[#dfe5e1] bg-white px-4 py-2 text-sm font-black"
          >
            {category.name}
          </a>
        ))}
      </nav>

      <div className="mt-4 space-y-8 pb-10">
        {menu.categories.map((category) => (
          <section key={category.id} id={`kategori-${category.id}`} className="scroll-mt-20">
            <h2 className="text-xl font-black tracking-[-0.02em]">{category.name}</h2>
            <ul className="mt-3 space-y-3">
              {category.products.map((product) => {
                const hasOptions = product.optionGroups.length > 0;
                return (
                  <li key={product.id} className="flex items-start gap-3 rounded-2xl border border-[#dfe5e1] bg-white p-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-black">{product.name}</p>
                      {product.description && <p className="mt-1 text-sm leading-5 text-[#68736e]">{product.description}</p>}
                      {hasOptions && (
                        <p className="mt-1 text-xs font-semibold text-[#8a948f]">
                          {product.optionGroups.map((group) => group.name).join(" · ")}
                        </p>
                      )}
                      <p className="mt-2 font-black text-[color:var(--c-accent-d2)]">
                        {hasOptions && <span className="mr-1 text-xs font-bold text-[#8a948f]">başlangıç</span>}
                        {formatMoney(startingPriceMinor(product.priceMinor, product.optionGroups))}
                      </p>
                    </div>
                    {product.soldOut && (
                      <span className="shrink-0 self-center rounded-lg bg-[#fff0ee] px-2 py-1 text-[11px] font-black text-[#b63b32]">
                        Tükendi
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
