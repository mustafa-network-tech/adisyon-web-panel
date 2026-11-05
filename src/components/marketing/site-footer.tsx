import Link from "next/link";
import { Mail } from "lucide-react";
import { Brand } from "@/components/brand";
import { WhatsappIcon } from "@/components/marketing/whatsapp-icon";
import { legalLinks } from "@/lib/legal";
import { contactEmail, whatsappDisplay, whatsappLink } from "@/lib/site";
import { solutionPages } from "@/lib/solution-pages";

const footerLink = "underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white";

export function SiteFooter() {
  return (
    <footer id="iletisim" className="bg-[color:var(--c-ink-deep)] py-12 text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-8 md:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_1fr] lg:px-10">
        <div>
          <Brand inverse />
          <p className="mt-5 max-w-sm text-sm leading-6 text-white/70">MK Digital Systems · Restoran operasyonları için tasarlandı.</p>
        </div>
        <div>
          <h2 className="text-xs font-black uppercase tracking-[0.14em] text-white/60">Çözümler</h2>
          <ul className="mt-4 space-y-2.5 text-sm font-semibold">
            {solutionPages.map((page) => (
              <li key={page.slug}><Link href={`/${page.slug}`} className={footerLink}>{page.navLabel}</Link></li>
            ))}
            <li><Link href="/#fiyatlar" className={footerLink}>Fiyatlar</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="text-xs font-black uppercase tracking-[0.14em] text-white/60">İletişim ve destek</h2>
          <ul className="mt-4 space-y-2.5 text-sm font-semibold">
            <li><a href={`mailto:${contactEmail}`} className={`inline-flex items-center gap-2 ${footerLink}`}><Mail size={15} aria-hidden="true" />{contactEmail}</a></li>
            <li><a href={whatsappLink()} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-2 ${footerLink}`}><WhatsappIcon size={15} />WhatsApp: {whatsappDisplay}</a></li>
            <li><Link href="/destek" className={footerLink}>Destek sayfası</Link></li>
            <li><Link href="/giris" className={footerLink}>İşletme girişi</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="text-xs font-black uppercase tracking-[0.14em] text-white/60">Yasal</h2>
          <ul className="mt-4 space-y-2.5 text-sm font-semibold">
            {legalLinks.map((link) => (
              <li key={link.href}><Link href={link.href} className={footerLink}>{link.label}</Link></li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
