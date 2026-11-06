"use client";

import { useActionState } from "react";
import { requestJoinAction } from "@/modules/auth/actions";
import { initialAuthActionState } from "@/modules/auth/state";

const wrapper =
  "flex min-h-13 items-center rounded-xl border border-[#dce3df] bg-[#f9faf9] px-4 focus-within:border-[color:var(--c-accent)] focus-within:bg-white";
const input = "min-w-0 flex-1 bg-transparent text-sm outline-none";

/** Join an existing business with its name and code; a manager still has to approve. */
export function JoinForm() {
  const [state, formAction, pending] = useActionState(requestJoinAction, initialAuthActionState);
  return (
    <form action={formAction} className="mt-7 space-y-5">
      <label className="block">
        <span className="mb-2 block text-sm font-bold text-[#33413b]">İşletme adı</span>
        <span className={wrapper}><input name="businessName" required minLength={2} maxLength={120} autoComplete="off" className={input} /></span>
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-bold text-[#33413b]">İşletme katılım kodu</span>
        <span className={wrapper}><input name="joinCode" required minLength={4} maxLength={40} autoComplete="off" autoCapitalize="characters" spellCheck={false} className={`${input} font-mono tracking-widest`} /></span>
      </label>
      <p className="text-xs leading-5 text-[#68736e]">Kodu işletme yöneticinizden alın. Kodu yazmak erişim vermez; yöneticiniz talebinizi onaylayıp görevinizi ve şubenizi belirler.</p>
      {state.message && (
        <p role="alert" className="rounded-xl bg-[#fff7f3] p-3 text-xs font-semibold leading-5 text-[#9e4328]">{state.message}</p>
      )}
      <button type="submit" disabled={pending} className="min-h-13 w-full rounded-xl bg-[color:var(--c-accent)] px-5 text-sm font-black text-white disabled:opacity-55">
        {pending ? "Gönderiliyor…" : "Katılma talebi gönder"}
      </button>
    </form>
  );
}
