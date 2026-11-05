"use client";

import { useActionState } from "react";
import { initialCrudActionState } from "@/modules/settings/action-state";
import { createBranchAction } from "../actions";

export function BranchForm({ tenant, branch }: { tenant: string; branch: string }) {
  const [state, action, pending] = useActionState(createBranchAction, initialCrudActionState);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="branch" value={branch} />
      <label htmlFor="branch-name" className="block text-sm font-black text-[#33413b]">Yeni şube adı</label>
      <input id="branch-name" name="name" required minLength={2} maxLength={120} placeholder="Örn. Kadıköy Şube" className="min-h-12 w-full rounded-xl border border-[#dce3df] bg-[#f9faf9] px-4 text-sm outline-none focus:border-[color:var(--c-accent)] focus:bg-white" />
      {state.message && <p role="alert" className="rounded-xl bg-[#fff7f3] p-3 text-xs font-semibold leading-5 text-[#9e4328]">{state.message}</p>}
      <button type="submit" disabled={pending} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[color:var(--c-accent-d3)] px-5 text-sm font-black text-white transition hover:bg-[color:var(--c-accent-d5)] disabled:opacity-55">
        {pending ? "Ekleniyor…" : "Şube ekle"}
      </button>
    </form>
  );
}
