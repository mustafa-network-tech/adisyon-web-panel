"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { CheckCircle2, Minus, Plus, ShoppingBag } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { OptionPicker } from "@/modules/catalog/components/option-picker";
import { optionLabel, optionLineKey, pickedOptions, selectionDeltaMinor, startingPriceMinor } from "@/modules/catalog/options";
import { placeCustomerOrderAction } from "../actions";
import type { PublicMenu, PublicMenuProduct } from "../types";

type Props = { token: string; menu: PublicMenu };

/** One cart line: a product plus the options the guest picked for it. */
type CartLine = { key: string; product: PublicMenuProduct; optionIds: string[]; quantity: number };

const MAX_PER_LINE = 20;

function unitPriceMinor(line: Pick<CartLine, "product" | "optionIds">) {
  return line.product.priceMinor + selectionDeltaMinor(line.product.optionGroups, line.optionIds);
}

export function PublicMenuView({ token, menu }: Props) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [picker, setPicker] = useState<PublicMenuProduct | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [placedOrder, setPlacedOrder] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const idempotencyKey = useRef<string | null>(null);

  const totalMinor = useMemo(() => cart.reduce((sum, line) => sum + unitPriceMinor(line) * line.quantity, 0), [cart]);
  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);

  function touched() {
    idempotencyKey.current = null;
    setError(null);
  }

  function addLine(product: PublicMenuProduct, optionIds: string[]) {
    touched();
    const key = optionLineKey(product.id, optionIds);
    setCart((current) => {
      const existing = current.find((line) => line.key === key);
      if (existing) return current.map((line) => (line.key === key ? { ...line, quantity: Math.min(MAX_PER_LINE, line.quantity + 1) } : line));
      return [...current, { key, product, optionIds: [...optionIds], quantity: 1 }];
    });
  }

  function change(key: string, delta: number) {
    touched();
    setCart((current) =>
      current
        .map((line) => (line.key === key ? { ...line, quantity: Math.min(MAX_PER_LINE, line.quantity + delta) } : line))
        .filter((line) => line.quantity > 0),
    );
  }

  function plus(product: PublicMenuProduct) {
    if (product.optionGroups.length > 0) setPicker(product);
    else addLine(product, []);
  }

  function submit() {
    if (!cart.length || pending) return;
    idempotencyKey.current ||= crypto.randomUUID();
    const key = idempotencyKey.current;
    setError(null);
    startTransition(async () => {
      const result = await placeCustomerOrderAction({
        token,
        idempotencyKey: key,
        items: cart.map((line) => ({
          productId: line.product.id,
          quantity: line.quantity,
          notes: "",
          options: line.optionIds,
        })),
      });
      if (result.ok) {
        setPlacedOrder(result.orderNumber);
        setCart([]);
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
          className="mt-6 min-h-12 rounded-2xl bg-[color:var(--c-ink)] px-6 text-sm font-black text-white"
        >
          Yeni sipariş ver
        </button>
      </div>
    );
  }

  return (
    <>
      {picker && (
        <OptionPicker
          productName={picker.name}
          basePriceMinor={picker.priceMinor}
          groups={picker.optionGroups}
          onCancel={() => setPicker(null)}
          onConfirm={(ids) => {
            addLine(picker, ids);
            setPicker(null);
          }}
        />
      )}
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

      <div className={`mt-4 space-y-8 ${itemCount ? "pb-48" : "pb-10"}`}>
        {menu.categories.map((category) => (
          <section key={category.id} id={`kategori-${category.id}`} className="scroll-mt-20">
            <h2 className="text-xl font-black tracking-[-0.02em]">{category.name}</h2>
            <ul className="mt-3 space-y-3">
              {category.products.map((product) => {
                const hasOptions = product.optionGroups.length > 0;
                const inCart = cart.filter((line) => line.product.id === product.id);
                const quantity = inCart.reduce((sum, line) => sum + line.quantity, 0);
                const simpleLine = hasOptions ? null : inCart[0];
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
                      <p className="mt-2 font-black text-[color:var(--c-accent-d2)]">
                        {hasOptions && <span className="mr-1 text-xs font-bold text-[#8a948f]">başlangıç</span>}
                        {formatMoney(startingPriceMinor(product.priceMinor, product.optionGroups))}
                      </p>
                      {hasOptions && quantity > 0 && (
                        <p className="mt-1 text-xs font-bold text-[#23866b]">Sepette {quantity} adet</p>
                      )}
                    </div>
                    {product.soldOut && (
                      <span className="shrink-0 self-center rounded-lg bg-[#fff0ee] px-2 py-1 text-[11px] font-black text-[#b63b32]">
                        Tükendi
                      </span>
                    )}
                    {menu.orderingEnabled && !product.orderable && !product.soldOut && (
                      <span className="shrink-0 self-center text-[11px] font-bold text-[#8a948f]">
                        Garsona sorun
                      </span>
                    )}
                    {canOrder &&
                      (!simpleLine ? (
                        <button
                          type="button"
                          onClick={() => plus(product)}
                          aria-label={hasOptions ? `${product.name} seçenekleri` : `${product.name} ekle`}
                          className="grid size-11 shrink-0 place-items-center rounded-xl bg-[color:var(--c-accent)] text-white"
                        >
                          <Plus size={20} />
                        </button>
                      ) : (
                        <div className="flex shrink-0 items-center gap-1 rounded-xl border border-[#dfe5e1] p-1">
                          <button
                            type="button"
                            onClick={() => change(simpleLine.key, -1)}
                            aria-label={`${product.name} azalt`}
                            className="grid size-9 place-items-center rounded-lg bg-[#eef1ef]"
                          >
                            <Minus size={16} />
                          </button>
                          <span className="w-6 text-center text-sm font-black">{simpleLine.quantity}</span>
                          <button
                            type="button"
                            onClick={() => change(simpleLine.key, 1)}
                            aria-label={`${product.name} artır`}
                            className="grid size-9 place-items-center rounded-lg bg-[color:var(--c-accent)] text-white"
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
            <ul aria-label="Sepetiniz" className="mb-3 max-h-36 space-y-2 overflow-y-auto">
              {cart.map((line) => {
                const picked = pickedOptions(line.product.optionGroups, line.optionIds).map((item) => optionLabel(item.kind, item.name));
                return (
                  <li key={line.key} className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-black">{line.product.name}</span>
                      {picked.length > 0 && <span className="block truncate text-xs font-semibold text-[#68736e]">{picked.join(" · ")}</span>}
                    </span>
                    <span className="flex shrink-0 items-center gap-1 rounded-lg border border-[#dfe5e1] p-0.5">
                      <button type="button" onClick={() => change(line.key, -1)} aria-label={`${line.product.name} azalt`} className="grid size-8 place-items-center rounded-md bg-[#eef1ef]"><Minus size={14} /></button>
                      <span className="w-6 text-center text-xs font-black">{line.quantity}</span>
                      <button type="button" onClick={() => change(line.key, 1)} aria-label={`${line.product.name} artır`} className="grid size-8 place-items-center rounded-md bg-[color:var(--c-accent)] text-white"><Plus size={14} /></button>
                    </span>
                    <span className="w-20 shrink-0 text-right text-xs font-black">{formatMoney(unitPriceMinor(line) * line.quantity)}</span>
                  </li>
                );
              })}
            </ul>
            {error && (
              <p role="alert" className="mb-3 rounded-xl bg-[#fdeeee] p-3 text-sm font-bold text-[#a73a3a]">
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className="flex min-h-14 w-full items-center justify-between rounded-2xl bg-[color:var(--c-ink)] px-5 text-white disabled:opacity-60"
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
