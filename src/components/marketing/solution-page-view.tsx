import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema } from "@/lib/seo";
import { getSolution, type SolutionPage } from "@/lib/solution-pages";
import { siteName } from "@/lib/site";

const primaryCta = "inline-flex min-h-14 items-center justify-center gap-3 rounded-2xl bg-[color:var(--c-accent-d3)] px-6 text-sm font-black text-white shadow-[0_16px_34px_rgb(181_66_33/0.24)] transition hover:-translate-y-0.5 hover:bg-[color:var(--c-accent-d5)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[color:var(--c-accent-d3)]";
const secondaryCta = "inline-flex min-h-14 items-center justify-center rounded-2xl border border-[#d6ddd9] bg-white px-6 text-sm font-black text-[color:var(--c-ink)] transition hover:border-[#aeb9b3] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[color:var(--c-accent-d3)]";

/** Shared layout of the public solution pages (server component, no client JS). */
export function SolutionPageView({ page }: { page: SolutionPage }) {
  const related = page.related.map(getSolution);

  return (
    <main>
      <JsonLd
        data={breadcrumbSchema([
          { name: siteName, path: "/" },
          { name: page.navLabel, path: `/${page.slug}` },
        ])}
      />

      <section className="mx-auto w-full max-w-7xl px-5 pb-16 pt-6 sm:px-8 lg:px-10 lg:pb-24">
        <nav aria-label="Sayfa yolu" className="text-sm font-semibold text-[#5e6a65]">
          <ol className="flex flex-wrap items-center gap-2">
            <li><Link href="/" className="underline-offset-4 hover:underline">Ana sayfa</Link></li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="text-[color:var(--c-ink)]">{page.navLabel}</li>
          </ol>
        </nav>

        <div className="mt-8 max-w-3xl">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[color:var(--c-accent-d4)]">{page.eyebrow}</p>
          <h1 className="mt-4 text-[clamp(2.2rem,5vw,4rem)] font-black leading-[1.02] tracking-[-0.045em] text-[color:var(--c-ink)]">
            {page.h1}
          </h1>
          <p className="mt-6 text-lg leading-8 text-[#4f5a55]">{page.lead}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/kayit" className={primaryCta}>
              7 günlük denemeyi başlat <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link href="/#fiyatlar" className={secondaryCta}>Fiyatları incele</Link>
          </div>
        </div>
      </section>

      <section className="bg-white py-16 sm:py-20">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:px-10">
          <h2 className="text-3xl font-black tracking-[-0.04em] text-[color:var(--c-ink)] sm:text-4xl">{page.problem.title}</h2>
          <div className="space-y-5 text-lg leading-8 text-[#4f5a55]">
            {page.problem.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </div>
        </div>
      </section>

      {page.sections.map((section, index) => (
        <section key={section.id} id={section.id} aria-labelledby={`${section.id}-baslik`} className={`py-16 sm:py-20 ${index % 2 === 0 ? "bg-[#f7f8f7]" : "bg-white"}`}>
          <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
            <div className="max-w-3xl">
              <h2 id={`${section.id}-baslik`} className="text-3xl font-black tracking-[-0.04em] text-[color:var(--c-ink)] sm:text-4xl">{section.title}</h2>
              {section.intro && <p className="mt-4 text-lg leading-8 text-[#4f5a55]">{section.intro}</p>}
            </div>
            <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {section.items.map((item) => (
                <li key={item.title} className="rounded-[24px] border border-[#e1e6e3] bg-white p-6">
                  <h3 className="flex items-start gap-2.5 text-lg font-black tracking-tight text-[color:var(--c-ink)]">
                    <Check size={19} className="mt-1 shrink-0 text-[#176e56]" aria-hidden="true" />
                    {item.title}
                  </h3>
                  <p className="mt-3 leading-7 text-[#4f5a55]">{item.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}

      {page.steps && (
        <section aria-labelledby="adimlar-baslik" className="bg-[color:var(--c-ink)] py-16 text-white sm:py-20">
          <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
            <h2 id="adimlar-baslik" className="max-w-3xl text-3xl font-black tracking-[-0.04em] sm:text-4xl">{page.steps.title}</h2>
            <ol className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {page.steps.items.map((step, index) => (
                <li key={step.title} className="rounded-2xl border border-white/10 bg-white/[0.06] p-5">
                  <span className="font-mono text-xs font-bold text-[color:var(--c-accent-light)]">0{index + 1}</span>
                  <h3 className="mt-3 text-lg font-black">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-white/75">{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      <section aria-labelledby="ilgili-baslik" className="bg-[#f7f8f7] py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
          <h2 id="ilgili-baslik" className="text-3xl font-black tracking-[-0.04em] text-[color:var(--c-ink)] sm:text-4xl">İlgili çözümler</h2>
          <ul className="mt-8 grid gap-5 md:grid-cols-3">
            {related.map((item) => (
              <li key={item.slug}>
                <Link href={`/${item.slug}`} className="group block h-full rounded-[24px] border border-[#e1e6e3] bg-white p-6 transition hover:-translate-y-1 hover:border-[#f0b29e]">
                  <h3 className="text-lg font-black tracking-tight text-[color:var(--c-ink)]">{item.navLabel}</h3>
                  <p className="mt-2 leading-7 text-[#4f5a55]">{item.summary}</p>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-black text-[color:var(--c-accent-d4)]">
                    Sayfayı incele <ArrowRight size={15} aria-hidden="true" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="son-cagri-baslik" className="bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
          <div className="rounded-[32px] bg-[color:var(--c-ink)] p-8 text-white sm:p-12">
            <h2 id="son-cagri-baslik" className="max-w-2xl text-3xl font-black tracking-[-0.04em] sm:text-4xl">Önce deneyin, sonra karar verin.</h2>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-white/75">
              Hesabınızı oluşturun, 7 günlük deneme süresinde masa, mutfak ve kasa ekranlarını kendi menünüzle deneyin. Sorularınız için bize yazın.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link href="/kayit" className={primaryCta}>
                7 günlük denemeyi başlat <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <Link href="/#fiyatlar" className="inline-flex min-h-14 items-center justify-center rounded-2xl bg-white px-6 text-sm font-black text-[color:var(--c-ink)] transition hover:bg-[#f3f5f4] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
                Fiyatları incele
              </Link>
              <Link href="/destek" className="inline-flex min-h-14 items-center justify-center rounded-2xl border border-white/30 px-6 text-sm font-black text-white transition hover:border-white/60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
                İletişim ve destek
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
