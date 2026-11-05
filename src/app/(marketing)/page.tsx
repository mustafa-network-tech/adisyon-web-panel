import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Check,
  ChefHat,
  CreditCard,
  LayoutGrid,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { PricingSection } from "@/components/marketing/pricing-section";

// Regenerated hourly so the launch prices disappear by themselves after the campaign deadline.
export const revalidate = 3600;

const features = [
  {
    icon: LayoutGrid,
    title: "Masa & sipariş",
    description: "Salon, bahçe ve terası tek görünümde yönetin. Dokunmatik sipariş akışıyla servis hızını artırın.",
  },
  {
    icon: ChefHat,
    title: "Akıllı mutfak",
    description: "Siparişleri istasyonlara ayırın; yeni, hazırlanıyor ve hazır durumlarını anlık takip edin.",
  },
  {
    icon: CreditCard,
    title: "Esnek kasa",
    description: "Nakit, kart ve karma ödeme; hesap bölme ve vardiya hareketleriyle tam kontrol sağlayın.",
  },
];

const trustItems = [
  "İşletmeler arası kesin veri ayrımı",
  "Rol ve yetki bazlı erişim",
  "Telefon, tablet ve masaüstü uyumu",
];

export default function MarketingPage() {
  return (
    <main className="min-h-dvh overflow-hidden bg-[#f7f8f7]">
      <header className="relative z-20 mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-10">
        <Brand />
        <nav className="hidden items-center gap-8 text-sm font-semibold text-[#5e6a65] md:flex" aria-label="Ana menü">
          <a href="#platform" className="transition-colors hover:text-[color:var(--c-ink)]">Platform</a>
          <a href="#fiyatlar" className="transition-colors hover:text-[color:var(--c-ink)]">Fiyatlar</a>
          <a href="#guvenlik" className="transition-colors hover:text-[color:var(--c-ink)]">Güvenlik</a>
          <a href="#iletisim" className="transition-colors hover:text-[color:var(--c-ink)]">İletişim</a>
        </nav>
        <Link href="/giris" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[color:var(--c-ink)] px-4 text-sm font-bold text-white transition hover:bg-[color:var(--c-ink-2)]">
          İşletme girişi <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </header>

      <section className="relative mx-auto grid min-h-[720px] w-full max-w-7xl items-center gap-14 px-5 pb-20 pt-12 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:px-10 lg:pb-28 lg:pt-16">
        <div className="relative z-10 max-w-xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#f1c8b9] bg-[color:var(--c-accent-soft)] px-3 py-2 text-xs font-extrabold uppercase tracking-[0.14em] text-[color:var(--c-accent-d3)]">
            <Sparkles size={14} aria-hidden="true" /> Yeni nesil restoran yönetimi
          </div>
          <h1 className="mt-7 text-[clamp(3rem,7vw,6.5rem)] font-black leading-[0.91] tracking-[-0.065em] text-[color:var(--c-ink)]">
            Servisin ritmi <span className="text-[color:var(--c-accent-d2)]">sizde.</span>
          </h1>
          <p className="mt-7 max-w-lg text-lg leading-8 text-[#68736e]">
            Masadan mutfağa, mutfaktan kasaya tüm operasyonu hızlandıran; her işletmeye uyum sağlayan modern adisyon platformu.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href="/app/demo-restoran/merkez/masalar" className="inline-flex min-h-14 items-center justify-center gap-3 rounded-2xl bg-[color:var(--c-accent-d3)] px-6 text-sm font-black text-white shadow-[0_16px_34px_rgb(181_66_33/0.24)] transition hover:-translate-y-0.5 hover:bg-[color:var(--c-accent-d5)]">
              Demo çalışma alanı <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <a href="#platform" className="inline-flex min-h-14 items-center justify-center rounded-2xl border border-[#d6ddd9] bg-white px-6 text-sm font-black text-[color:var(--c-ink)] transition hover:border-[#aeb9b3]">
              Platformu keşfet
            </a>
          </div>
          <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-xs font-bold text-[#4f5a55]">
            {trustItems.map((item) => (
              <span key={item} className="inline-flex items-center gap-2">
                <Check size={15} className="text-[#23866b]" aria-hidden="true" /> {item}
              </span>
            ))}
          </div>
        </div>

        <div className="relative lg:min-h-[560px]" aria-label="MK Adisyon arayüz önizlemesi">
          <div className="absolute -right-24 -top-32 size-[440px] rounded-full bg-[#ffd9c9]/55 blur-3xl" />
          <div className="absolute -bottom-24 left-4 size-[320px] rounded-full bg-[#cde7dc]/70 blur-3xl" />
          <div className="relative overflow-hidden rounded-[32px] border border-white/80 bg-[color:var(--c-ink)] p-3 shadow-[0_40px_90px_rgb(23_33_29/0.24)] sm:p-5 lg:rotate-[1.5deg]">
            <div className="flex items-center justify-between px-2 pb-4 text-white">
              <div>
                <p className="text-xs font-bold text-white/70">MERKEZ ŞUBE</p>
                <p className="mt-1 text-lg font-black">Akşam servisi</p>
              </div>
              <div className="flex -space-x-2">
                {["AY", "EK", "ZÖ"].map((name) => (
                  <span key={name} className="grid size-9 place-items-center rounded-full border-2 border-[color:var(--c-ink)] bg-[#f0b94c] text-[10px] font-black text-[color:var(--c-ink)]">{name}</span>
                ))}
              </div>
            </div>
            <div className="rounded-[24px] bg-[#f3f5f4] p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[color:var(--c-accent-d3)]">Salon görünümü</p>
                  <h2 className="mt-1 text-2xl font-black tracking-tight text-[color:var(--c-ink)]">12 masa · 8 aktif</h2>
                </div>
                <span className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-[#68736e] shadow-sm">19:42</span>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[
                  ["M01", "Boş", "bg-white", "text-[#176e56]"],
                  ["M02", "₺1.240", "bg-[color:var(--c-accent-soft)]", "text-[color:var(--c-accent-d4)]"],
                  ["M03", "₺860", "bg-[#fff7de]", "text-[#7d5208]"],
                  ["M04", "Boş", "bg-white", "text-[#176e56]"],
                  ["M05", "₺2.180", "bg-[color:var(--c-accent-soft)]", "text-[color:var(--c-accent-d4)]"],
                  ["M06", "Hazır", "bg-[#dff3eb]", "text-[#176e56]"],
                ].map(([table, status, bg, color]) => (
                  <div key={table} className={`min-h-28 rounded-2xl p-4 shadow-[0_8px_24px_rgb(23_33_29/0.06)] ${bg}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-black text-[color:var(--c-ink)]">{table}</span>
                      <span className="size-2 rounded-full bg-current text-[color:var(--c-accent)]" />
                    </div>
                    <p className={`mt-7 text-sm font-extrabold ${color}`}>{status}</p>
                    <p className="mt-1 text-[10px] font-semibold text-[#5f6964]">4 kişilik</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="absolute -bottom-8 -left-5 hidden rounded-2xl border border-white/80 bg-white p-4 shadow-[0_18px_45px_rgb(23_33_29/0.16)] sm:flex sm:items-center sm:gap-3 lg:-left-12">
            <span className="grid size-11 place-items-center rounded-xl bg-[#dff3eb] text-[#176e56]"><BarChart3 size={21} /></span>
            <div><p className="text-xs font-bold text-[#68736e]">Bugünkü ciro</p><p className="mt-1 text-lg font-black">₺48.920</p></div>
          </div>
        </div>
      </section>

      <section id="platform" className="bg-white py-24 sm:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
          <div className="max-w-2xl">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[color:var(--c-accent-d3)]">Tek platform, tam operasyon</p>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.045em] text-[color:var(--c-ink)] sm:text-5xl">Yoğun serviste sakin kontrol.</h2>
            <p className="mt-5 text-lg leading-8 text-[#68736e]">Ekiplerin ihtiyaç duyduğu bilgi, tam ihtiyaç duydukları anda karşılarında.</p>
          </div>
          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, description }, index) => (
              <article key={title} className="group rounded-[28px] border border-[#e1e6e3] bg-[#f8f9f8] p-7 transition hover:-translate-y-1 hover:border-[#f0b29e] hover:bg-[#fffaf8]">
                <div className="flex items-start justify-between">
                  <span className="grid size-13 place-items-center rounded-2xl bg-[color:var(--c-ink)] text-white"><Icon size={23} aria-hidden="true" /></span>
                  <span className="font-mono text-xs font-bold text-[#68736e]">0{index + 1}</span>
                </div>
                <h3 className="mt-8 text-2xl font-black tracking-tight text-[color:var(--c-ink)]">{title}</h3>
                <p className="mt-3 leading-7 text-[#68736e]">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <PricingSection />

      <section id="guvenlik" className="bg-[color:var(--c-ink)] py-24 text-white sm:py-28">
        <div className="mx-auto grid max-w-7xl gap-14 px-5 sm:px-8 lg:grid-cols-2 lg:items-center lg:px-10">
          <div>
            <span className="grid size-14 place-items-center rounded-2xl bg-white/10 text-[color:var(--c-accent-light)]"><ShieldCheck size={27} /></span>
            <h2 className="mt-7 text-4xl font-black tracking-[-0.04em] sm:text-5xl">Her işletme kendi dünyasında.</h2>
            <p className="mt-5 max-w-xl text-lg leading-8 text-white/60">Multi-tenant mimari, satır seviyesinde güvenlik ve rol bazlı yetkilendirme ilk günden platformun temelinde.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              [Users, "Rol bazlı erişim", "Garson, mutfak, kasa ve yönetici için görev odaklı alanlar."],
              [ShieldCheck, "Tenant izolasyonu", "İşletme verileri uygulama ve veritabanı katmanında ayrılır."],
              [BarChart3, "İzlenebilir hareketler", "Kritik işlemler denetim kayıtlarıyla takip edilir."],
              [Sparkles, "İşletmeye özel", "Tema, masa düzeni, istasyonlar ve yetkiler özelleştirilir."],
            ].map(([Icon, title, text]) => {
              const ItemIcon = Icon as typeof Users;
              return <article key={title as string} className="rounded-2xl border border-white/10 bg-white/[0.055] p-5"><ItemIcon size={20} className="text-[color:var(--c-accent-light)]" /><h3 className="mt-5 font-black">{title as string}</h3><p className="mt-2 text-sm leading-6 text-white/55">{text as string}</p></article>;
            })}
          </div>
        </div>
      </section>

      <footer id="iletisim" className="bg-[color:var(--c-ink-deep)] py-12 text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-10">
          <Brand inverse />
          <p className="text-sm text-white/65">MK Digital Systems · Restoran operasyonları için tasarlandı.</p>
          <Link href="/giris" className="inline-flex min-h-11 items-center gap-2 self-start rounded-xl border border-white/15 px-4 text-sm font-bold hover:bg-white/5 md:self-auto">İşletme girişi <ArrowRight size={15} /></Link>
        </div>
      </footer>
    </main>
  );
}
