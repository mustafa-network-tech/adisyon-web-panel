"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import {
  signInAction,
} from "@/modules/auth/actions";
import { initialAuthActionState } from "@/modules/auth/state";

type LoginFormProps = {
  configured: boolean;
  nextPath?: string;
};

export function LoginForm({ configured, nextPath }: LoginFormProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [state, formAction, pending] = useActionState(
    signInAction,
    initialAuthActionState,
  );

  return (
    <form action={formAction} className="mt-8 space-y-5">
      {nextPath && <input type="hidden" name="next" value={nextPath} />}
      <label className="block">
        <span className="mb-2 block text-sm font-bold text-[#33413b]">
          E-posta adresi
        </span>
        <span className="flex min-h-13 items-center gap-3 rounded-xl border border-[#dce3df] bg-[#f9faf9] px-4 transition focus-within:border-[#e8623a] focus-within:bg-white focus-within:ring-4 focus-within:ring-[#fff0ea]">
          <Mail size={18} className="text-[#8a948f]" aria-hidden="true" />
          <input type="email" name="email" autoComplete="email" required placeholder="ornek@isletme.com" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#a6afaa]" />
        </span>
      </label>
      <label className="block">
        <span className="mb-2 flex items-center justify-between text-sm font-bold text-[#33413b]">
          Şifre
          <Link href="/sifremi-unuttum" className="text-xs font-bold text-[#d8542f] hover:underline">Şifremi unuttum</Link>
        </span>
        <span className="flex min-h-13 items-center gap-3 rounded-xl border border-[#dce3df] bg-[#f9faf9] px-4 transition focus-within:border-[#e8623a] focus-within:bg-white focus-within:ring-4 focus-within:ring-[#fff0ea]">
          <LockKeyhole size={18} className="text-[#8a948f]" aria-hidden="true" />
          <input type={showPassword ? "text" : "password"} name="password" autoComplete="current-password" required minLength={8} placeholder="••••••••" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#a6afaa]" />
          <button type="button" className="grid size-9 place-items-center rounded-lg text-[#68736e] hover:bg-[#eef1ef]" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}>
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </span>
      </label>
      {state.message && <p role={state.status === "error" ? "alert" : "status"} className="rounded-xl border border-[#f3d2c6] bg-[#fff7f3] p-3 text-xs font-semibold leading-5 text-[#9e4328]">{state.message}</p>}
      {!configured && <p role="alert" className="rounded-xl bg-[#fff7f3] p-3 text-xs font-semibold text-[#9e4328]">Supabase ortam değişkenleri tanımlı değil.</p>}
      <button type="submit" disabled={!configured || pending} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#17211d] px-5 text-sm font-black text-white transition hover:bg-[#293831] disabled:cursor-not-allowed disabled:opacity-55">
        {pending ? "Giriş yapılıyor…" : "Güvenli giriş"}
        {!pending && <ArrowRight size={17} aria-hidden="true" />}
      </button>
    </form>
  );
}
