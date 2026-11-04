"use client";

import { useActionState } from "react";
import { Mail } from "lucide-react";
import { requestPasswordResetAction } from "@/modules/auth/actions";
import { initialAuthActionState } from "@/modules/auth/state";

export function PasswordResetRequestForm() {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, initialAuthActionState);

  return (
    <form action={formAction} className="mt-7 space-y-4">
      <label className="block">
        <span className="mb-2 block text-sm font-bold text-[#33413b]">E-posta adresi</span>
        <span className="flex min-h-13 items-center gap-3 rounded-xl border border-[#dce3df] bg-[#f9faf9] px-4 focus-within:border-[#e8623a] focus-within:bg-white">
          <Mail size={18} className="text-[#8a948f]" aria-hidden="true" />
          <input type="email" name="email" autoComplete="email" required className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
        </span>
      </label>
      {state.message && <p role={state.status === "error" ? "alert" : "status"} className={`rounded-xl p-3 text-xs font-semibold leading-5 ${state.status === "success" ? "bg-[#edf8f3] text-[#176e56]" : "bg-[#fff7f3] text-[#9e4328]"}`}>{state.message}</p>}
      <button type="submit" disabled={pending} className="min-h-13 w-full rounded-xl bg-[#17211d] px-5 text-sm font-black text-white disabled:opacity-55">{pending ? "Gönderiliyor…" : "Yenileme bağlantısı gönder"}</button>
    </form>
  );
}
