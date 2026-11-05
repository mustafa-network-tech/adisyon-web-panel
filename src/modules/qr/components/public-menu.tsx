"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { CheckCircle2, Minus, Plus, ShoppingBag } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { placeCustomerOrderAction } from "../actions";
import type { PublicMenu } from "../types";

type Props = { token: string; menu: PublicMenu };

export function PublicMenuView({ token, menu }: Props) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [placedOrder, setPlacedOrder] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const idempotencyKey = useRef<string | null>(null);

  const productIndex = useMemo(
    () =>
      new Map(
        menu.categories.flatMap((category) =>
          category.products.map((product) => [product.id, product] as const),
        ),
      ),
    [menu],
  );
  const lines = Object.entries(cart)
    .map(([id, quantity]) => ({ product: productIndex.get(id), quantity }))
    .filter((line) => line.product && line.quantity > 0);
  const totalMinor = lines.reduce(
    (sum, line) => sum + (line.product?.priceMinor || 0) * line.quantity,
    0,
  );
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);

  function change(productId: string, delta: number) {
    idempotencyKey.current = null;
    setError(null);
    setCart((current) => {
      const next = Math.max(0, Math.min(20, (current[productId] || 0) + delta));
      const copy = { ...current };
      if (next === 0) delete copy[productId];
      else copy[productId] = next;
      return copy;
    });
  }

  function submit() {
    if (!lines.length || pending) return;
    idempotencyKey.current ||= crypto.randomUUID();
    const key = idempotencyKey.current;
    setError(null);
    startTransition(async () => {
      const result = await placeCustomerOrderAction({
        token,
        idempotencyKey: key,
        items: lines.map((line) => ({
          productId: line.product!.id,
          quantity: line.quantity,
          notes: "",
        })),
      });
      if (result.ok) {
        setPlacedOrder(result.orderNumber);
        setCart({});
        idempotencyKey.current = null;
      } else {
        setError(result.message);
      }
    });
  }

  if (placedOrder !== null) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-3xl border border-[#bddfcf] bg-[#edf8f3] p-8 text-center">
        <CheckCircle2 className="mx-auto text-[#23866b]" size={52} />
        <h2 className="mt-4 text-2xl font-black">Siparişiniz alındı</h2>
        <p className="mt-2 text-sm font-semibold text-[#397a67]">
          Sipariş no #{placedOrder} · {menu.tableLabel}. Siparişiniz iletildi, masanıza getirilecek.
        </p>
        <button
          type="button"
          onClick={() => setPlacedOrder(null)}
          className="mt-6 min-h-12 rounded-2xl bg-[#17211d] px-6 text-sm font-black text-white"
        >
          Yeni sipariş ver
        </button>
      </div>
    );
  }

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

      <div className={`mt-4 space-y-8 ${itemCount ? "pb-32" : "pb-10"}`}>
        {menu.categories.map((category) => (
          <section key={category.id} id={`kategori-${category.id}`} className="scroll-mt-20">
            <h2 className="text-xl font-black tracking-[-0.02em]">{category.name}</h2>
            <ul className="mt-3 space-y-3">
              {category.products.map((product) => {
                const quantity = cart[product.id] || 0;
                const canOrder = menu.orderingEnabled && product.orderable;
                return (
                  <li
                    key={product.id}
                    className="flex items-start gap-3 rounded-2xl border border-[#dfe5e1] bg-white p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-black">{product.name}</p>
                      {product.description && (
                        <p className="mt-1 text-sm leading-5 text-[#68736e]">
                          {product.description}
                        </p>
                      )}
                      <p className="mt-2 font-black text-[#c94927]">
                        {formatMoney(product.priceMinor)}
                      </p>
                    </div>
                    {menu.orderingEnabled && !product.orderable && (
                      <span className="shrink-0 self-center text-[11px] font-bold text-[#8a948f]">
                        Garsona sorun
                      </span>
                    )}
                    {canOrder &&
                      (quantity === 0 ? (
                        <button
                          type="button"
                          onClick={() => change(product.id, 1)}
                          aria-label={`${product.name} ekle`}
                          className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#e8623a] text-white"
                        >
                          <Plus size={20} />
                        </button>
                      ) : (
                        <div className="flex shrink-0 items-center gap-1 rounded-xl border border-[#dfe5e1] p-1">
                          <button
                            type="button"
                            onClick={() => change(product.id, -1)}
                            aria-label={`${product.name} azalt`}
                            className="grid size-9 place-items-center rounded-lg bg-[#eef1ef]"
                          >
                            <Minus size={16} />
                          </button>
                          <span className="w-6 text-center text-sm font-black">{quantity}</span>
                          <button
                            type="button"
                            onClick={() => change(product.id, 1)}
                            aria-label={`${product.name} artır`}
                            className="grid size-9 place-items-center rounded-lg bg-[#e8623a] text-white"
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                      ))}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {itemCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[#dfe5e1] bg-white p-4 shadow-[0_-12px_30px_rgb(23_33_29/0.08)]">
          <div className="mx-auto max-w-2xl">
            {error && (
              <p role="alert" className="mb-3 rounded-xl bg-[#fdeeee] p-3 text-sm font-bold text-[#a73a3a]">
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className="flex min-h-14 w-full items-center justify-between rounded-2xl bg-[#17211d] px-5 text-white disabled:opacity-60"
            >
              <span className="flex items-center gap-2 font-black">
                <ShoppingBag size={19} />
                {pending ? "Gönderiliyor…" : `Siparişi gönder (${itemCount})`}
              </span>
              <span className="font-black">{formatMoney(totalMinor)}</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
