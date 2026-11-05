import Link from "next/link";
import { ArrowRight, ChevronDown, Menu } from "lucide-react";
import { Brand } from "@/components/brand";
import { solutionPages } from "@/lib/solution-pages";

const linkClass = "transition-colors hover:text-[color:var(--c-ink)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[color:var(--c-accent-d3)]";

/**
 * Public site header. Navigation is plain links; the solutions dropdown and the
 * mobile menu use <details>, so they work without client JavaScript and every
 * link is present in the server-rendered HTML.
 */
export function SiteHeader() {
  return (
    <header className="relative z-30 mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-5 py-5 sm:px-8 lg:px-10">
      <Brand />

      <nav className="hidden items-center gap-8 text-sm font-semibold text-[#5e6a65] md:flex" aria-label="Ana menü">
        <Link href="/#platform" className={linkClass}>Platform</Link>
        <details className="group relative">
          <summary className={`flex min-h-11 cursor-pointer list-none items-center gap-1.5 marker:hidden [&::-webkit-details-marker]:hidden ${linkClass}`}>
            Çözümler <ChevronDown size={15} className="transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <ul className="absolute left-1/2 top-full z-40 w-72 -translate-x-1/2 rounded-2xl border border-[#dfe5e1] bg-white p-2 shadow-[0_18px_45px_rgb(23_33_29/0.14)]">
            {solutionPages.map((page) => (
              <li key={page.slug}>
                <Link href={`/${page.slug}`} className="block rounded-xl px-3 py-2.5 hover:bg-[#f3f5f4]">
                  <span className="block font-bold text-[color:var(--c-ink)]">{page.navLabel}</span>
                  <span className="mt-0.5 block text-xs font-medium leading-5 text-[#5e6a65]">{page.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
        <Link href="/#fiyatlar" className={linkClass}>Fiyatlar</Link>
        <Link href="/#iletisim" className={linkClass}>İletişim</Link>
      </nav>

      <div className="flex items-center gap-2">
        <Link href="/giris" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[color:var(--c-ink)] px-4 text-sm font-bold text-white transition hover:bg-[color:var(--c-ink-2)]">
          <span className="sm:hidden">Giriş</span><span className="hidden sm:inline">İşletme girişi</span> <ArrowRight size={16} aria-hidden="true" />
        </Link>

        <details className="group relative md:hidden">
          <summary className="grid size-11 cursor-pointer list-none place-items-center rounded-xl border border-[#d6ddd9] bg-white text-[color:var(--c-ink)] marker:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--c-accent-d3)] [&::-webkit-details-marker]:hidden">
            <Menu size={20} aria-hidden="true" />
            <span className="sr-only">Menüyü aç veya kapat</span>
          </summary>
          <nav aria-label="Mobil menü" className="absolute right-0 top-full z-40 mt-2 w-[min(20rem,calc(100vw-2.5rem))] rounded-2xl border border-[#dfe5e1] bg-white p-3 shadow-[0_18px_45px_rgb(23_33_29/0.18)]">
            <p className="px-3 pb-1 pt-2 text-xs font-black uppercase tracking-[0.14em] text-[#5e6a65]">Çözümler</p>
            <ul>
              {solutionPages.map((page) => (
                <li key={page.slug}>
                  <Link href={`/${page.slug}`} className="block rounded-xl px-3 py-3 text-sm font-bold text-[color:var(--c-ink)] hover:bg-[#f3f5f4]">{page.navLabel}</Link>
                </li>
              ))}
            </ul>
            <ul className="mt-2 border-t border-[#e8ece9] pt-2 text-sm font-bold text-[color:var(--c-ink)]">
              <li><Link href="/#platform" className="block rounded-xl px-3 py-3 hover:bg-[#f3f5f4]">Platform</Link></li>
              <li><Link href="/#fiyatlar" className="block rounded-xl px-3 py-3 hover:bg-[#f3f5f4]">Fiyatlar</Link></li>
              <li><Link href="/#iletisim" className="block rounded-xl px-3 py-3 hover:bg-[#f3f5f4]">İletişim</Link></li>
            </ul>
          </nav>
        </details>
      </div>
    </header>
  );
}
