import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { WhatsappIcon } from "@/components/marketing/whatsapp-icon";
import { whatsappLink } from "@/lib/site";

/** Frame of the public marketing pages: header, page content, footer and WhatsApp button. */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh overflow-x-clip bg-[#f7f8f7]">
      <SiteHeader />
      {children}
      <SiteFooter />
      <a
        href={whatsappLink()}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="WhatsApp ile iletişime geçin"
        className="fixed bottom-5 right-5 z-50 grid size-14 place-items-center rounded-full bg-[#25d366] text-white shadow-[0_10px_28px_rgb(0_0_0/0.28)] transition hover:scale-105 hover:bg-[#1ebe5a] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#25d366]"
      >
        <WhatsappIcon size={30} />
      </a>
    </div>
  );
}
