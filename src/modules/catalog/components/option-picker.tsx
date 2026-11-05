"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { formatDelta, groupRuleText, selectionDeltaMinor, validateSelection, type OptionGroup } from "../options";

type Props = {
  productName: string;
  basePriceMinor: number;
  groups: OptionGroup[];
  onConfirm: (selectedIds: string[]) => void;
  onCancel: () => void;
  confirmLabel?: string;
};

/** Modal where a guest or waiter picks portion, extras and removals before a product is added. */
export function OptionPicker({ productName, basePriceMinor, groups, onConfirm, onCancel, confirmLabel = "Ekle" }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [showError, setShowError] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const error = useMemo(() => validateSelection(groups, selected), [groups, selected]);
  const totalMinor = basePriceMinor + selectionDeltaMinor(groups, selected);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  function toggle(group: OptionGroup, choiceId: string) {
    setShowError(false);
    setSelected((current) => {
      const on = current.includes(choiceId);
      if (group.kind === "variant") {
        const others = current.filter((id) => !group.choices.some((choice) => choice.id === id));
        return on && group.minSelect === 0 ? others : [...others, choiceId];
      }
      return on ? current.filter((id) => id !== choiceId) : [...current, choiceId];
    });
  }

  function confirm() {
    if (error) {
      setShowError(true);
      return;
    }
    onConfirm(selected);
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`${productName} seçenekleri`} className="flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-3xl bg-white shadow-2xl outline-none sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3 border-b border-[#edf0ee] p-5">
          <div>
            <h2 className="text-xl font-black">{productName}</h2>
            <p className="mt-1 text-xs font-semibold text-[#8a948f]">Tercihlerinizi seçin</p>
          </div>
          <button type="button" onClick={onCancel} className="grid size-10 shrink-0 place-items-center rounded-xl border border-[#dce3df]" aria-label="Kapat"><X size={18} /></button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          {groups.map((group) => (
            <fieldset key={group.id}>
              <legend className="flex w-full items-baseline justify-between gap-3">
                <span className="text-sm font-black">{group.name}</span>
                <span className="text-[11px] font-bold text-[#8a948f]">{groupRuleText(group)}</span>
              </legend>
              <ul className="mt-2 space-y-2">
                {group.choices.map((choice) => {
                  const checked = selected.includes(choice.id);
                  const inputType = group.kind === "variant" ? "radio" : "checkbox";
                  return (
                    <li key={choice.id}>
                      <label className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 text-sm font-bold ${choice.soldOut ? "cursor-not-allowed border-[#edf0ee] bg-[#f6f8f7] text-[#a7afab]" : checked ? "border-[#e8623a] bg-[#fff7f3]" : "border-[#dfe5e1] bg-white"}`}>
                        <input type={inputType} name={`group-${group.id}`} checked={checked} disabled={choice.soldOut} onChange={() => toggle(group, choice.id)} className="size-5 accent-[#e8623a]" />
                        <span className="flex-1">{choice.name}</span>
                        {choice.soldOut ? <span className="text-[11px] font-black text-[#b63b32]">Tükendi</span> : <span className="text-xs font-black text-[#68736e]">{formatDelta(choice.priceDeltaMinor)}</span>}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          ))}
        </div>

        <div className="border-t border-[#edf0ee] p-5">
          {showError && error && <p role="alert" className="mb-3 rounded-xl bg-[#fff7f3] p-3 text-sm font-bold text-[#9e4328]">{error}</p>}
          <button type="button" onClick={confirm} className="flex min-h-14 w-full items-center justify-between rounded-2xl bg-[#17211d] px-5 text-white">
            <span className="font-black">{confirmLabel}</span>
            <span className="font-black">{formatMoney(totalMinor)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
