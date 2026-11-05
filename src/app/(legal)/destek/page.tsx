import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound, LifeBuoy, Mail, QrCode, Rocket } from "lucide-react";
import { supportMailto, supportTemplateLines } from "@/lib/support";
import { contactEmail } from "@/lib/site";

export const metadata: Metadata = {
  title: "Destek ve iletişim",
  description: "MK Adisyon destek ve iletişim: sorunuzu e-posta ile iletin, hangi bilgileri eklemeniz gerektiğini ve sık sorulan konuları görün.",
  alternates: { canonical: "/destek" },
};

const quickHelp = [
  { icon: KeyRound, title: "Şifremi unuttum", text: "Giriş sayfasındaki “Şifremi unuttum” bağlantısıyla e-postanıza sıfırlama bağlantısı gönderebilirsiniz.", href: "/sifremi-unuttum", cta: "Şifre sıfırla" },
  { icon: QrCode, title: "QR kodları yazdırma", text: "Ayarlar → QR menü sayfasından her masanın kodunu indirebilir veya yazdırabilirsiniz. Kod yenilerseniz eski basılı kod çalışmaz.", href: null, cta: null },
  { icon: Rocket, title: "Paket yükseltme veya soru", text: "Masa, personel veya istasyon sınırınıza ulaştıysanız ya da paketinizi değiştirmek istiyorsanız bize yazın.", href: null, cta: null },
];

export default function SupportPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-[color:var(--c-accent-d4)]">Destek</p>
      <h1 className="mt-3 text-4xl font-black tracking-[-0.045em] text-[color:var(--c-ink)] sm:text-5xl">Destek ve iletişim</h1>
      <p className="mt-6 text-base leading-7 text-[#33413b]">Her türlü soru, sorun ve talebiniz için bize e-posta ile ulaşabilirsiniz. Standart ve öncelikli destek, seçtiğiniz pakete göre sunulur.</p>

      <section aria-labelledby="eposta-baslik" className="mt-8 rounded-[24px] border border-[#e1e6e3] bg-white p-6 sm:p-8">
        <h2 id="eposta-baslik" className="flex items-center gap-2 text-xl font-black text-[color:var(--c-ink)]"><LifeBuoy size={20} aria-hidden="true" />E-posta ile destek</h2>
        <p className="mt-3 text-base font-semibold text-[#33413b]"><a href={supportMailto()} className="inline-flex items-center gap-2 text-[color:var(--c-accent-d4)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"><Mail size={18} aria-hidden="true" />{contactEmail}</a></p>
        <a href={supportMailto()} className="mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[color:var(--c-ink)] px-6 text-sm font-black text-white hover:bg-[color:var(--c-ink-2)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[color:var(--c-accent-d3)]">Hazır şablonla e-posta aç</a>

        <h3 className="mt-8 text-sm font-black uppercase tracking-[0.1em] text-[#4f5a55]">Hızlı çözüm için e-postaya ekleyin</h3>
        <ul className="mt-3 list-disc space-y-1.5 pl-6 text-sm leading-6 text-[#33413b]">
          {supportTemplateLines.map((line) => <li key={line}>{line}</li>)}
        </ul>
      </section>

      <section aria-labelledby="sik-baslik" className="mt-8">
        <h2 id="sik-baslik" className="text-2xl font-black tracking-tight text-[color:var(--c-ink)]">Sık sorulan konular</h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-1">
          {quickHelp.map(({ icon: Icon, title, text, href, cta }) => (
            <li key={title} className="flex items-start gap-4 rounded-2xl border border-[#e1e6e3] bg-white p-5">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[color:var(--c-accent-soft)] text-[color:var(--c-accent-d4)]"><Icon size={20} aria-hidden="true" /></span>
              <span>
                <span className="block text-base font-black text-[color:var(--c-ink)]">{title}</span>
                <span className="mt-1 block text-sm leading-6 text-[#33413b]">{text}</span>
                {href && cta && <Link href={href} className="mt-2 inline-block text-sm font-black text-[color:var(--c-accent-d4)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4">{cta}</Link>}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
