import type { Metadata } from "next";
import { CheckCircle2, ShieldCheck, Wifi } from "lucide-react";
import { Brand } from "@/components/brand";
import { LoginForm } from "@/modules/auth/components/login-form";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = {
  title: "İşletme girişi",
};

export default function LoginPage() {
  const configured = isSupabaseConfigured();

  return (
    <main className="grid min-h-dvh bg-[#f4f6f8] lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden overflow-hidden bg-[#17211d] p-12 text-white lg:flex lg:flex-col lg:justify-between xl:p-16">
        <div className="absolute -left-28 top-1/4 size-96 rounded-full bg-[#e8623a]/20 blur-3xl" />
        <div className="absolute -bottom-32 right-0 size-[450px] rounded-full bg-[#23866b]/20 blur-3xl" />
        <Brand inverse />
        <div className="relative max-w-xl">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ff9878]">Operasyon merkezi</p>
          <h1 className="mt-5 text-5xl font-black leading-[1.02] tracking-[-0.05em] xl:text-6xl">Servise hazır olduğunuzda, sistem de hazır.</h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-white/60">Tüm ekibiniz için hızlı, güvenli ve işletmenize özel bir çalışma alanı.</p>
          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            {[[ShieldCheck, "Güvenli erişim"], [Wifi, "PWA hazır"], [CheckCircle2, "Anlık durum"]].map(([Icon, label]) => {
              const ItemIcon = Icon as typeof ShieldCheck;
              return <div key={label as string} className="rounded-2xl border border-white/10 bg-white/5 p-4"><ItemIcon size={20} className="text-[#ff9878]" /><p className="mt-4 text-sm font-bold">{label as string}</p></div>;
            })}
          </div>
        </div>
        <p className="relative text-xs font-semibold text-white/35">MK Digital Systems · Faz 1 geliştirme ortamı</p>
      </section>

      <section className="flex items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-md rounded-[28px] border border-[#dfe5e1] bg-white p-6 shadow-[0_28px_80px_rgb(23_33_29/0.08)] sm:p-9">
          <div className="lg:hidden"><Brand /></div>
          <div className="mt-9 lg:mt-0">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#e8623a]">Hoş geldiniz</p>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] text-[#17211d]">İşletmenize giriş yapın</h2>
            <p className="mt-3 text-sm leading-6 text-[#68736e]">Size tanımlanan e-posta ve şifreyle devam edin.</p>
          </div>
          <LoginForm configured={configured} />
          <p className="mt-7 text-center text-xs leading-5 text-[#8a948f]">Giriş yaparak güvenlik ve kullanım koşullarını kabul etmiş olursunuz.</p>
        </div>
      </section>
    </main>
  );
}
