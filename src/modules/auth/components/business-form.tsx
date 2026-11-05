"use client";

import { useActionState } from "react";
import { createBusinessAction } from "@/modules/auth/actions";
import { initialAuthActionState } from "@/modules/auth/state";

const wrapper =
  "flex min-h-13 items-center rounded-xl border border-[#dce3df] bg-[#f9faf9] px-4 focus-within:border-[color:var(--c-accent)] focus-within:bg-white";
const input = "min-w-0 flex-1 bg-transparent text-sm outline-none";

export function BusinessForm() {
  const [state, formAction, pending] = useActionState(createBusinessAction, initialAuthActionState);

  return (
    <form action={formAction} className="mt-7 space-y-4">
      <label className="block">
        <span className="mb-2 block text-sm font-bold text-[#33413b]">İşletme adı</span>
        <span className={wrapper}><input name="name" required minLength={2} maxLength={120} placeholder="Örn. Mavi Katraj Restoran" className={input} /></span>
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-bold text-[#33413b]">İlk şube adı</span>
        <span className={wrapper}><input name="branchName" required minLength={2} maxLength={120} defaultValue="Merkez Şube" className={input} /></span>
      </label>
      {state.message && (
        <p role="alert" className="rounded-xl bg-[#fff7f3] p-3 text-xs font-semibold leading-5 text-[#9e4328]">
          {state.message}
        </p>
      )}
      <button type="submit" disabled={pending} className="min-h-13 w-full rounded-xl bg-[color:var(--c-accent)] px-5 text-sm font-black text-white disabled:opacity-55">
        {pending ? "Kuruluyor…" : "İşletmemi oluştur"}
      </button>
    </form>
  );
}
