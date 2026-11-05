"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { optionLabel } from "@/modules/catalog/options";
import { voidOrderItemAction } from "../void-actions";
import type { VoidMode } from "../void";
import type { OrderSnapshot } from "../types";

const inputClass = "min-h-11 w-full rounded-xl border border-[#dce3df] bg-[#f9faf9] px-3 text-sm outline-none focus:border-[color:var(--c-accent)] focus:bg-white";

/** Take back or give away units that already went to the kitchen; always needs a reason. */
export function VoidPanel({ tenant, branch, order }: { tenant: string; branch: string; order: OrderSnapshot }) {
  const router = useRouter();
  const sentItems = order.items.filter((item) => item.sentQuantity > 0);
  const [itemId, setItemId] = useState(sentItems[0]?.id || "");
  const [quantity, setQuantity] = useState(1);
  const [mode, setMode] = useState<VoidMode>("void");
  const [feedback, setFeedback] = useState<{ type: "error" | "success"; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const item = sentItems.find((candidate) => candidate.id === itemId) || sentItems[0];

  if (!item || ["closed", "cancelled"].includes(order.status)) return null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!item) return;
    const form = event.currentTarget;
    const reason = String(new FormData(form).get("reason") || "");
    const label = mode === "void" ? "iptal edilsin" : "ikram edilsin";
    if (!window.confirm(`${quantity}× ${item.productName} ${label} mi?`)) return;
    setFeedback(null);
    startTransition(async () => {
      const result = await voidOrderItemAction({ tenant, branch, orderId: order.id, orderItemId: item.id, expectedVersion: order.version, quantity, mode, reason });
      setFeedback({ type: result.ok ? "success" : "error", message: result.message });
      if (result.ok) {
        form.reset();
        setQuantity(1);
        if (result.orderCancelled) router.push(`/app/${tenant}/${branch}/masalar`);
      }
      router.refresh();
    });
  }

  return (
    <div className="rounded-[24px] border border-[#dfe5e1] bg-white p-5">
      <div className="flex items-center gap-2"><Ban size={19} className="text-[color:var(--c-accent)]" /><h2 className="text-lg font-black">İptal / ikram</h2></div>
      <p className="mt-2 text-xs font-semibold leading-5 text-[#7a8580]">Mutfağa gitmiş ürünü geri alın ya da ikram edin. Gerekçe zorunludur; yönetici ve mutfak anında haberdar edilir.</p>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <label className="block"><span className="mb-1.5 block text-xs font-bold text-[#68736e]">Ürün</span>
          <select className={inputClass} value={item.id} onChange={(event) => { setItemId(event.target.value); setQuantity(1); }}>
            {sentItems.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.productName}{candidate.options.length > 0 ? ` (${candidate.options.map((option) => optionLabel(option.kind, option.name)).join(", ")})` : ""} · {candidate.sentQuantity} adet · {formatMoney(candidate.unitPriceMinor)}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="mb-1.5 block text-xs font-bold text-[#68736e]">Adet</span>
            <input type="number" min={1} max={item.sentQuantity} value={quantity} onChange={(event) => setQuantity(Math.max(1, Math.min(item.sentQuantity, Number(event.target.value) || 1)))} className={inputClass} />
          </label>
          <label className="block"><span className="mb-1.5 block text-xs font-bold text-[#68736e]">İşlem</span>
            <select className={inputClass} value={mode} onChange={(event) => setMode(event.target.value === "comp" ? "comp" : "void")}>
              <option value="void">İptal (adisyondan çıkar)</option>
              <option value="comp">İkram (ücretsiz)</option>
            </select>
          </label>
        </div>
        <label className="block"><span className="mb-1.5 block text-xs font-bold text-[#68736e]">Gerekçe (zorunlu)</span>
          <input name="reason" minLength={3} maxLength={200} required className={inputClass} placeholder={mode === "void" ? "Örn. müşteri vazgeçti, yanlış girildi" : "Örn. müşteri şikayeti, doğum günü"} />
        </label>
        <button disabled={isPending} className="min-h-11 w-full rounded-xl bg-[color:var(--c-ink)] text-sm font-black text-white disabled:opacity-50">{isPending ? "İşleniyor…" : mode === "void" ? "Ürünü iptal et" : "Ürünü ikram et"}</button>
      </form>
      {feedback && <p role={feedback.type === "error" ? "alert" : "status"} className={`mt-3 rounded-xl p-3 text-xs font-semibold ${feedback.type === "error" ? "bg-[#fff7f3] text-[#9e4328]" : "bg-[#edf8f3] text-[#176e56]"}`}>{feedback.message}</p>}
    </div>
  );
}
