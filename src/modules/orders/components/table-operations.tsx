"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Combine } from "lucide-react";
import { mergeOrdersAction, moveOrderToTableAction } from "../table-actions";

export type MoveTarget = { id: string; label: string; areaName: string };
export type MergeTarget = { orderId: string; tableLabel: string; orderNumber: number };

type Props = {
  tenant: string;
  branch: string;
  orderId: string;
  version: number;
  moveTargets: MoveTarget[];
  mergeTargets: MergeTarget[];
};

const selectClass = "min-h-11 w-full rounded-xl border border-[#dce3df] bg-[#f9faf9] px-3 text-sm outline-none focus:border-[color:var(--c-accent)] focus:bg-white";

export function TableOperations({ tenant, branch, orderId, version, moveTargets, mergeTargets }: Props) {
  const router = useRouter();
  const [moveTo, setMoveTo] = useState("");
  const [mergeFrom, setMergeFrom] = useState("");
  const [feedback, setFeedback] = useState<{ type: "error" | "success"; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; message: string }>, onDone: () => void) {
    setFeedback(null);
    startTransition(async () => {
      const result = await action();
      setFeedback({ type: result.ok ? "success" : "error", message: result.message });
      if (result.ok) onDone();
      router.refresh();
    });
  }

  function move() {
    if (!moveTo) return;
    run(() => moveOrderToTableAction({ tenant, branch, orderId, expectedVersion: version, tableId: moveTo }), () => setMoveTo(""));
  }

  function merge() {
    if (!mergeFrom) return;
    // This adisyon is absorbed into the chosen one, so the customer keeps a single bill.
    const destination = mergeTargets.find((item) => item.orderId === mergeFrom);
    if (!destination || !window.confirm(`Bu adisyon ${destination.tableLabel} (#${destination.orderNumber}) adisyonuna birleştirilecek ve bu masa boşalacak. Devam edilsin mi?`)) return;
    run(() => mergeOrdersAction({ tenant, branch, sourceOrderId: orderId, sourceVersion: version, destinationOrderId: mergeFrom }), () => {
      setMergeFrom("");
      router.push(`/app/${tenant}/${branch}/siparis/${mergeFrom}`);
    });
  }

  return (
    <div className="rounded-[24px] border border-[#dfe5e1] bg-white p-5">
      <div className="flex items-center gap-2"><ArrowRightLeft size={20} className="text-[color:var(--c-accent)]" /><h2 className="text-lg font-black">Masa işlemleri</h2></div>

      <div className="mt-4 space-y-2">
        <p className="text-xs font-bold text-[#68736e]">Başka bir masaya taşı</p>
        <select value={moveTo} onChange={(event) => setMoveTo(event.target.value)} className={selectClass} disabled={moveTargets.length === 0}>
          <option value="">{moveTargets.length === 0 ? "Boş masa yok" : "Boş masa seçin"}</option>
          {moveTargets.map((table) => <option key={table.id} value={table.id}>{table.areaName} · {table.label}</option>)}
        </select>
        <button type="button" onClick={move} disabled={!moveTo || isPending} className="min-h-11 w-full rounded-xl border border-[#dce3df] text-sm font-black disabled:opacity-45">Masayı taşı</button>
      </div>

      <div className="mt-5 space-y-2 border-t border-[#edf0ee] pt-4">
        <p className="flex items-center gap-1.5 text-xs font-bold text-[#68736e]"><Combine size={14} />Başka bir adisyona birleştir</p>
        <select value={mergeFrom} onChange={(event) => setMergeFrom(event.target.value)} className={selectClass} disabled={mergeTargets.length === 0}>
          <option value="">{mergeTargets.length === 0 ? "Açık başka adisyon yok" : "Birleştirilecek masa"}</option>
          {mergeTargets.map((target) => <option key={target.orderId} value={target.orderId}>{target.tableLabel} · #{target.orderNumber}</option>)}
        </select>
        <button type="button" onClick={merge} disabled={!mergeFrom || isPending} className="min-h-11 w-full rounded-xl border border-[#dce3df] text-sm font-black disabled:opacity-45">Adisyonları birleştir</button>
        <p className="text-[11px] font-semibold leading-5 text-[#8a948f]">Birleştirmede bu masanın ürünleri seçilen adisyona geçer. Ödeme alınmış veya indirimli adisyon birleştirilemez.</p>
      </div>
      {feedback && <p role={feedback.type === "error" ? "alert" : "status"} className={`mt-3 rounded-xl p-3 text-xs font-semibold ${feedback.type === "error" ? "bg-[#fff7f3] text-[#9e4328]" : "bg-[#edf8f3] text-[#176e56]"}`}>{feedback.message}</p>}
    </div>
  );
}
