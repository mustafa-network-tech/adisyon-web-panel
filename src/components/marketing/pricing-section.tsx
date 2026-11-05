import Link from "next/link";
import { ArrowRight, CalendarClock, Check, Star } from "lucide-react";
import {
  LAUNCH_MONTHS,
  formatTl,
  includedInAllPlans,
  isLaunchCampaignActive,
  launchDeadlineText,
  pricingPlans,
  type PricingPlan,
} from "@/lib/pricing";

/**
 * Price list on the marketing page. Static markup (no client code): the page
 * is regenerated hourly, so after the campaign deadline only regular prices
 * remain. Subscriptions are activated by hand; there is no payment form.
 */
export function PricingSection() {
  const campaign = isLaunchCampaignActive();
  const deadline = launchDeadlineText();

  return (
    <section id="fiyatlar" aria-labelledby="fiyatlar-baslik" className="bg-[#f7f8f7] py-24 sm:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
        <div className="max-w-3xl">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[color:var(--c-accent-d4)]">Fiyatlar</p>
          <h2 id="fiyatlar-baslik" className="mt-4 text-4xl font-black tracking-[-0.045em] text-[color:var(--c-ink)] sm:text-5xl">
            Net fiyat. Her pakette QR menü dahil.
          </h2>
          <p className="mt-5 text-lg leading-8 text-[#4f5a55]">
            İşletmenizin büyüklüğüne göre paketinizi seçin. Tüm paketlerde QR menü ve QR sipariş dahildir; QR siparişlerinden komisyon alınmaz.
          </p>
        </div>

        {campaign && (
          <p className="mt-8 flex items-start gap-3 rounded-2xl border border-[#f1c8b9] bg-[color:var(--c-accent-soft)] p-4 text-sm font-bold leading-6 text-[#7d2f17] sm:items-center sm:p-5">
            <CalendarClock size={20} className="mt-0.5 shrink-0 sm:mt-0" aria-hidden="true" />
            <span>
              Lansman kampanyası: <strong className="font-black">{deadline}</strong> tarihine kadar aboneliği başlayan işletmeler, başlangıç tarihinden itibaren ilk {LAUNCH_MONTHS} ay lansman fiyatından yararlanır.
            </span>
          </p>
        )}

        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3 lg:items-stretch">
          {pricingPlans.map((plan, index) => (
            <PlanCard key={plan.id} plan={plan} campaign={campaign} deadline={deadline} wide={index === pricingPlans.length - 1} />
          ))}
        </div>

        <div className="mt-8 rounded-[28px] border border-[#e1e6e3] bg-white p-6 sm:p-8">
          <h3 className="text-xl font-black tracking-tight text-[color:var(--c-ink)]">Tüm paketlerde standart</h3>
          <ul className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {includedInAllPlans.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm font-semibold leading-6 text-[#2f3a35]">
                <Check size={17} className="mt-1 shrink-0 text-[#176e56]" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <ul className="mt-8 space-y-2 text-sm leading-6 text-[#4f5a55]">
          <li>Fiyatlara KDV dahil değildir.</li>
          {campaign && (
            <li>
              Lansman kampanyasına son katılım tarihi {deadline}. Bu tarihe kadar aboneliği başlayan işletmeler için ilk {LAUNCH_MONTHS} ay lansman fiyatı uygulanır; yedinci aydan itibaren paketin normal fiyatı geçerlidir.
            </li>
          )}
          <li>İlk 12 aydan sonraki yenilemeler güncel tarife üzerinden yapılabilir.</li>
          <li>Hesabınızı oluşturduktan sonra aboneliğiniz ekibimiz tarafından etkinleştirilir.</li>
        </ul>

        <p className="mt-8 text-sm font-bold text-[color:var(--c-ink)]">
          Önce görmek ister misiniz?{" "}
          <Link
            href="/app/demo-restoran/merkez/masalar"
            className="inline-flex items-center gap-1.5 rounded-sm font-black text-[color:var(--c-accent-d4)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[color:var(--c-accent-d3)]"
          >
            Demo çalışma alanını inceleyin <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </p>
      </div>
    </section>
  );
}

function PlanCard({ plan, campaign, deadline, wide }: { plan: PricingPlan; campaign: boolean; deadline: string; wide: boolean }) {
  const featured = Boolean(plan.featured);
  const headingId = `paket-${plan.id}`;
  const muted = featured ? "text-white/75" : "text-[#4f5a55]";

  return (
    <article
      aria-labelledby={headingId}
      className={`relative flex flex-col rounded-[28px] border p-7 sm:p-8 ${wide ? "md:col-span-2 lg:col-span-1" : ""} ${
        featured
          ? "border-[color:var(--c-accent-d3)] bg-[color:var(--c-ink)] text-white shadow-[0_28px_70px_rgb(23_33_29/0.28)] ring-2 ring-[color:var(--c-accent-d3)] lg:-my-4 lg:py-12"
          : "border-[#e1e6e3] bg-white text-[color:var(--c-ink)]"
      }`}
    >
      {featured && (
        <p className="absolute -top-4 left-7 inline-flex items-center gap-1.5 rounded-full bg-[color:var(--c-accent-d3)] px-4 py-1.5 text-xs font-black uppercase tracking-[0.1em] text-white sm:left-8">
          <Star size={13} aria-hidden="true" /> En çok tercih edilen
        </p>
      )}

      <h3 id={headingId} className="text-2xl font-black tracking-tight">{plan.name}</h3>
      <p className={`mt-2 text-sm leading-6 ${muted}`}>{plan.tagline}</p>

      <div className="mt-7">
        {campaign ? (
          <>
            <p className={`text-base font-bold ${muted}`}>
              <s>
                <span className="sr-only">Normal fiyat: </span>
                {formatTl(plan.regularPrice)}/ay
              </s>
            </p>
            <p className="mt-1 flex items-baseline gap-1.5">
              <span className="text-5xl font-black tracking-[-0.05em] sm:text-6xl">{new Intl.NumberFormat("tr-TR").format(plan.launchPrice)}</span>
              <span className="text-xl font-black">TL</span>
              <span className={`text-base font-bold ${muted}`}>/ay</span>
              <span className="sr-only"> lansman fiyatı, ilk {LAUNCH_MONTHS} ay</span>
            </p>
            <p className={`mt-3 text-sm font-black ${featured ? "text-[color:var(--c-accent-light)]" : "text-[color:var(--c-accent-d4)]"}`}>İlk {LAUNCH_MONTHS} ay lansman fiyatı</p>
            <p className={`mt-1 text-sm font-semibold ${muted}`}>Sonrasında {formatTl(plan.regularPrice)}/ay</p>
          </>
        ) : (
          <p className="flex items-baseline gap-1.5">
            <span className="text-5xl font-black tracking-[-0.05em] sm:text-6xl">{new Intl.NumberFormat("tr-TR").format(plan.regularPrice)}</span>
            <span className="text-xl font-black">TL</span>
            <span className={`text-base font-bold ${muted}`}>/ay</span>
          </p>
        )}
        <p className={`mt-2 text-xs font-semibold ${muted}`}>+ KDV</p>
        {campaign && <p className={`mt-1 text-xs font-semibold ${muted}`}>Son katılım: {deadline}</p>}
      </div>

      <Link
        href="/kayit"
        className={`mt-7 inline-flex min-h-13 items-center justify-center gap-2 rounded-2xl px-6 text-sm font-black text-white transition focus-visible:outline-2 focus-visible:outline-offset-3 ${
          featured
            ? "bg-[color:var(--c-accent-d3)] hover:bg-[color:var(--c-accent-d5)] focus-visible:outline-white"
            : "bg-[color:var(--c-ink)] hover:bg-[color:var(--c-ink-2)] focus-visible:outline-[color:var(--c-accent-d3)]"
        }`}
      >
        Hesap oluştur <ArrowRight size={17} aria-hidden="true" />
        <span className="sr-only"> — {plan.name} paketi için</span>
      </Link>

      <ul className={`mt-8 grid gap-3 border-t pt-7 ${featured ? "border-white/15" : "border-[#e8ecea]"} ${wide ? "md:grid-cols-2 lg:grid-cols-1" : ""}`}>
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-3 text-sm font-semibold leading-6">
            <Check size={17} className={`mt-1 shrink-0 ${featured ? "text-[#7ee0b8]" : "text-[#176e56]"}`} aria-hidden="true" />
            {feature}
          </li>
        ))}
      </ul>
    </article>
  );
}
