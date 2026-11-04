"use client";

import { useActionState } from "react";
import { signUpAction } from "@/modules/auth/actions";
import { initialAuthActionState } from "@/modules/auth/state";

const wrapper =
  "flex min-h-13 items-center rounded-xl border border-[#dce3df] bg-[#f9faf9] px-4 focus-within:border-[#e8623a] focus-within:bg-white";
const input = "min-w-0 flex-1 bg-transparent text-sm outline-none";

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signUpAction, initialAuthActionState);

  return (
    <form action={formAction} className="mt-7 space-y-4">
      <label className="block">
        <span className="mb-2 block text-sm font-bold text-[#33413b]">Ad soyad</span>
        <span className={wrapper}><input name="fullName" autoComplete="name" required minLength={2} className={input} /></span>
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-bold text-[#33413b]">E-posta adresi</span>
        <span className={wrapper}><input type="email" name="email" autoComplete="email" required className={input} /></span>
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-bold text-[#33413b]">Şifre</span>
        <span className={wrapper}><input type="password" name="password" autoComplete="new-password" required minLength={8} placeholder="En az 8 karakter" className={input} /></span>
      </label>
      {state.message && (
        <p role={state.status === "error" ? "alert" : "status"} className={`rounded-xl p-3 text-xs font-semibold leading-5 ${state.status === "success" ? "bg-[#edf8f3] text-[#176e56]" : "bg-[#fff7f3] text-[#9e4328]"}`}>
          {state.message}
        </p>
      )}
      <button type="submit" disabled={pending} className="min-h-13 w-full rounded-xl bg-[#17211d] px-5 text-sm font-black text-white disabled:opacity-55">
        {pending ? "Oluşturuluyor…" : "Üyelik oluştur"}
      </button>
    </form>
  );
}
