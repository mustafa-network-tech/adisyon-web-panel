import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, KeyRound } from "lucide-react";
import { Brand } from "@/components/brand";
import { PasswordResetRequestForm } from "@/modules/auth/components/password-reset-request-form";

export const metadata: Metadata = { title: "Şifremi unuttum" };

export default function ForgotPasswordPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-[#f4f6f8] p-5">
      <section className="w-full max-w-md rounded-[28px] border border-[#dfe5e1] bg-white p-6 shadow-[0_28px_80px_rgb(23_33_29/0.08)] sm:p-9">
        <Brand />
        <div className="mt-9 grid size-12 place-items-center rounded-xl bg-[#fff0ea] text-[#d8542f]">
          <KeyRound size={22} aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-3xl font-black tracking-[-0.04em] text-[#17211d]">Şifrenizi yenileyin</h1>
        <p className="mt-3 text-sm leading-6 text-[#68736e]">Hesabınıza ait e-posta adresini girin. Kayıtlıysa güvenli yenileme bağlantısı göndereceğiz.</p>
        <PasswordResetRequestForm />
        <Link href="/giris" className="mt-6 flex min-h-11 items-center justify-center gap-2 text-sm font-bold text-[#68736e] hover:text-[#17211d]"><ArrowLeft size={16} /> Giriş ekranına dön</Link>
      </section>
    </main>
  );
}
