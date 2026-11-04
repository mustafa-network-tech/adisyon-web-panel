"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";

export function LoginForm({ configured }: { configured: boolean }) {
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(
      configured
        ? "Kimlik doğrulama akışı Faz 2'de etkinleştirilecek."
        : "Supabase bağlantısı bilinçli olarak yapılandırılmadı. Demo çalışma alanını kullanabilirsiniz.",
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-5">
      <label className="block">
        <span className="mb-2 block text-sm font-bold text-[#33413b]">E-posta adresi</span>
        <span className="flex min-h-13 items-center gap-3 rounded-xl border border-[#dce3df] bg-[#f9faf9] px-4 transition focus-within:border-[#e8623a] focus-within:bg-white focus-within:ring-4 focus-within:ring-[#fff0ea]">
          <Mail size={18} className="text-[#8a948f]" aria-hidden="true" />
          <input type="email" name="email" autoComplete="email" required placeholder="ornek@isletme.com" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#a6afaa]" />
        </span>
      </label>
      <label className="block">
        <span className="mb-2 flex items-center justify-between text-sm font-bold text-[#33413b]">
          Şifre
          <button type="button" className="text-xs font-bold text-[#d8542f] hover:underline" onClick={() => setMessage("Şifre yenileme akışı Faz 2 kapsamındadır.")}>Şifremi unuttum</button>
        </span>
        <span className="flex min-h-13 items-center gap-3 rounded-xl border border-[#dce3df] bg-[#f9faf9] px-4 transition focus-within:border-[#e8623a] focus-within:bg-white focus-within:ring-4 focus-within:ring-[#fff0ea]">
          <LockKeyhole size={18} className="text-[#8a948f]" aria-hidden="true" />
          <input type={showPassword ? "text" : "password"} name="password" autoComplete="current-password" required placeholder="••••••••" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#a6afaa]" />
          <button type="button" className="grid size-9 place-items-center rounded-lg text-[#68736e] hover:bg-[#eef1ef]" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}>
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </span>
      </label>
      {message && <p role="status" className="rounded-xl border border-[#f3d2c6] bg-[#fff7f3] p-3 text-xs font-semibold leading-5 text-[#9e4328]">{message}</p>}
      <button type="submit" className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#17211d] px-5 text-sm font-black text-white transition hover:bg-[#293831]">
        Güvenli giriş <ArrowRight size={17} aria-hidden="true" />
      </button>
      <Link href="/app/demo-restoran/merkez/masalar" className="flex min-h-12 w-full items-center justify-center rounded-xl border border-[#dce3df] bg-white px-5 text-sm font-bold text-[#33413b] transition hover:bg-[#f7f9f8]">
        Demo çalışma alanını aç
      </Link>
    </form>
  );
}
