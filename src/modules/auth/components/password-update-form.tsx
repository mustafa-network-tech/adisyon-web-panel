"use client";

import { useActionState } from "react";
import { updatePasswordAction } from "@/modules/auth/actions";
import { initialAuthActionState } from "@/modules/auth/state";

export function PasswordUpdateForm() {
  const [state, formAction, pending] = useActionState(updatePasswordAction, initialAuthActionState);

  return (
    <form action={formAction} className="mt-7 space-y-4">
      {[["password", "Yeni şifre"], ["passwordConfirm", "Yeni şifre tekrar"]].map(([name, label]) => (
        <label key={name} className="block">
          <span className="mb-2 block text-sm font-bold text-[#33413b]">{label}</span>
          <input type="password" name={name} autoComplete="new-password" required minLength={8} maxLength={128} className="min-h-13 w-full rounded-xl border border-[#dce3df] bg-[#f9faf9] px-4 text-sm outline-none focus:border-[#e8623a] focus:bg-white" />
        </label>
      ))}
      {state.message && <p role="alert" className="rounded-xl bg-[#fff7f3] p-3 text-xs font-semibold text-[#9e4328]">{state.message}</p>}
      <button type="submit" disabled={pending} className="min-h-13 w-full rounded-xl bg-[#17211d] px-5 text-sm font-black text-white disabled:opacity-55">{pending ? "Güncelleniyor…" : "Şifreyi güncelle"}</button>
    </form>
  );
}
