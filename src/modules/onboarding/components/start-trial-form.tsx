"use client";

import { useActionState } from "react";
import { initialCrudActionState } from "@/modules/settings/action-state";
import { startTrialAction } from "../actions";

export function StartTrialForm({ tenant, branch }: { tenant: string; branch: string }) {
  const [state, action, pending] = useActionState(startTrialAction, initialCrudActionState);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="branch" value={branch} />
      <label className="flex items-start gap-3 text-sm font-semibold leading-6 text-[#33413b]">
        <input type="checkbox" name="confirm" required className="mt-1 size-5 shrink-0 accent-[color:var(--c-accent-d3)]" />
        <span>7 günlük ücretsiz denemeyi şimdi başlatmak istiyorum. Süre bugünden itibaren işler ve başlatıldıktan sonra yeniden başlatılamaz.</span>
      </label>
      {state.message && <p role="alert" className="rounded-xl bg-[#fff7f3] p-3 text-xs font-semibold leading-5 text-[#9e4328]">{state.message}</p>}
      <button type="submit" disabled={pending} className="inline-flex min-h-13 w-full items-center justify-center rounded-xl bg-[color:var(--c-accent-d3)] px-6 text-sm font-black text-white transition hover:bg-[color:var(--c-accent-d5)] disabled:opacity-55 sm:w-auto">
        {pending ? "Başlatılıyor…" : "7 günlük denemeyi başlat"}
      </button>
    </form>
  );
}
