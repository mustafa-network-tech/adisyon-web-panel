"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setProductAvailabilityAction } from "../actions";

type Props = {
  tenant: string;
  branch: string;
  productId: string;
  productName: string;
  soldOut: boolean;
};

/** One-tap "sold out for today" switch; the mark clears itself tomorrow. */
export function AvailabilityToggle({ tenant, branch, productId, productName, soldOut }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    setError(null);
    startTransition(async () => {
      const result = await setProductAvailabilityAction({ tenant, branch, productId, soldOut: !soldOut });
      if (!result.ok) setError(result.message);
      router.refresh();
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={isPending}
        aria-pressed={soldOut}
        aria-label={soldOut ? `${productName} tekrar satışta` : `${productName} bugün tükendi`}
        className={`min-h-10 whitespace-nowrap rounded-xl border px-3 text-xs font-black disabled:opacity-50 ${soldOut ? "border-[#f0c6bb] bg-[#fff0ee] text-[#b63b32]" : "border-[#dce3df] bg-white text-[color:var(--c-ink)]"}`}
      >
        {isPending ? "…" : soldOut ? "Tükendi · tekrar aç" : "Bugün tükendi"}
      </button>
      {error && <span role="alert" className="text-[11px] font-bold text-[#9e4328]">{error}</span>}
    </span>
  );
}
