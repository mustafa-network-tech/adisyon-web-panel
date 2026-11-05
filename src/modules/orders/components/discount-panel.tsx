"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgePercent, X } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { applyItemDiscountAction, applyOrderDiscountAction } from "../discount-actions";
import { describeDiscount, parseDiscountValue, type DiscountKind } from "../discount";
import type { OrderSnapshot } from "../types";

const inputClass = "min-h-11 w-full rounded-xl border border-[#dce3df] bg-[#f9faf9] px-3 text-sm outline-none focus:border-[color:var(--c-accent)] focus:bg-white";

export function DiscountPanel({ tenant, branch, order }: { tenant: string; branch: string; order: OrderSnapshot }) {
  const router = useRouter();
  const [target, setTarget] = useState("order");
  const [kind, setKind] = useState<DiscountKind>("percent");
  const [feedback, setFeedback] = useState<{ type: "error" | "success"; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const discountedItems = order.items.filter((item) => item.listUnitPriceMinor !== null);
  const editable = !["closed", "cancelled"].includes(order.status);

  function run(action: () => Promise<{ ok: boolean; message: string }>) {
    setFeedback(null);
    startTransition(async () => {
      const result = await action();
      setFeedback({ type: result.ok ? "success" : "error", message: result.message });
      router.refresh();
    });
  }

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const value = parseDiscountValue(kind, String(data.get("value") || ""));
    if (value === undefined) {
      setFeedback({ type: "error", message: kind === "percent" ? "Yüzdeyi 10 veya 12,5 gibi girin (en fazla 100)." : "Tutarı 50 veya 25,50 gibi girin." });
      return;
    }
    const common = { tenant, branch, orderId: order.id, expectedVersion: order.version, kind, value, reason: String(data.get("reason") || "") };
    run(() => target === "order" ? applyOrderDiscountAction(common) : applyItemDiscountAction({ ...common, orderItemId: target }));
    form.reset();
  }

  function removeOrderDiscount() {
    run(() => applyOrderDiscountAction({ tenant, branch, orderId: order.id, expectedVersion: order.version, kind: "none", value: null, reason: "" }));
  }

  function removeItemDiscount(orderItemId: string) {
    run(() => applyItemDiscountAction({ tenant, branch, orderId: order.id, expectedVersion: order.version, orderItemId, kind: "none", value: null, reason: "" }));
  }

  return (
    <div className="rounded-[24px] border border-[#dfe5e1] bg-white p-5">
      <div className="flex items-center gap-2"><BadgePercent size={20} className="text-[color:var(--c-accent)]" /><h2 className="text-lg font-black">İndirim</h2></div>

      {(order.discountType || discountedItems.length > 0) && (
        <ul className="mt-3 space-y-2">
          {order.discountType && (
            <li className="flex items-center gap-2 rounded-xl bg-[#fff8f4] p-3 text-xs font-bold">
              <span className="min-w-0 flex-1">Adisyon: {order.discountType === "percent" ? describeDiscount("percent", order.discountValue) : formatMoney(order.discountValue)} → −{formatMoney(order.discountMinor)}<span className="block font-semibold text-[#8a948f]">{order.discountReason}</span></span>
              {editable && <button type="button" onClick={removeOrderDiscount} disabled={isPending} className="grid size-8 shrink-0 place-items-center rounded-lg border border-[#f0c6bb] text-[#b63b32]" aria-label="Adisyon indirimini kaldır"><X size={14} /></button>}
            </li>
          )}
          {discountedItems.map((item) => (
            <li key={item.id} className="flex items-center gap-2 rounded-xl bg-[#fff8f4] p-3 text-xs font-bold">
              <span className="min-w-0 flex-1">{item.productName}: {formatMoney(item.listUnitPriceMinor || 0)} → {formatMoney(item.unitPriceMinor)}<span className="block font-semibold text-[#8a948f]">{item.discountReason}</span></span>
              {editable && <button type="button" onClick={() => removeItemDiscount(item.id)} disabled={isPending} className="grid size-8 shrink-0 place-items-center rounded-lg border border-[#f0c6bb] text-[#b63b32]" aria-label={`${item.productName} indirimini kaldır`}><X size={14} /></button>}
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <form onSubmit={apply} className="mt-4 space-y-3">
          <label className="block"><span className="mb-1.5 block text-xs font-bold text-[#68736e]">Nereye</span>
            <select value={target} onChange={(event) => setTarget(event.target.value)} className={inputClass}>
              <option value="order">Tüm adisyon</option>
              {order.items.map((item) => <option key={item.id} value={item.id}>{item.productName} ({formatMoney(item.listUnitPriceMinor ?? item.unitPriceMinor)})</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="mb-1.5 block text-xs font-bold text-[#68736e]">Tür</span>
              <select value={kind} onChange={(event) => setKind(event.target.value === "amount" ? "amount" : "percent")} className={inputClass}>
                <option value="percent">Yüzde (%)</option>
                <option value="amount">{target === "order" ? "Tutar (₺)" : "Birim başına tutar (₺)"}</option>
              </select>
            </label>
            <label className="block"><span className="mb-1.5 block text-xs font-bold text-[#68736e]">Değer</span><input name="value" inputMode="decimal" className={inputClass} placeholder={kind === "percent" ? "10" : "50"} required /></label>
          </div>
          <label className="block"><span className="mb-1.5 block text-xs font-bold text-[#68736e]">Gerekçe (zorunlu)</span><input name="reason" minLength={3} maxLength={200} className={inputClass} placeholder="Örn. müşteri memnuniyeti, ikram" required /></label>
          <button disabled={isPending} className="min-h-11 w-full rounded-xl bg-[color:var(--c-ink)] text-sm font-black text-white disabled:opacity-50">{isPending ? "Uygulanıyor…" : "İndirimi uygula"}</button>
          <p className="text-[11px] font-semibold leading-5 text-[#8a948f]">Her indirim gerekçesiyle denetim kaydına yazılır. Adisyon indirimi varsa ödemede ürün bazlı tahsilat yapılamaz.</p>
        </form>
      )}
      {feedback && <p role={feedback.type === "error" ? "alert" : "status"} className={`mt-3 rounded-xl p-3 text-xs font-semibold ${feedback.type === "error" ? "bg-[#fff7f3] text-[#9e4328]" : "bg-[#edf8f3] text-[#176e56]"}`}>{feedback.message}</p>}
    </div>
  );
}
