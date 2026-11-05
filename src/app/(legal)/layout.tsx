import Link from "next/link";
import { ArrowLeft, Mail } from "lucide-react";
import { Brand } from "@/components/brand";
import { LegalLinks } from "@/components/legal/legal-links";
import { companyLines } from "@/lib/legal";
import { contactEmail } from "@/lib/site";

/** Shared frame of the public legal and support pages. */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#f7f8f7]">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <Brand />
        <Link href="/" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#d6ddd9] bg-white px-4 text-sm font-bold text-[color:var(--c-ink)] hover:border-[#aeb9b3]">
          <ArrowLeft size={16} aria-hidden="true" /> Ana sayfa
        </Link>
      </header>
      <main>{children}</main>
      <footer className="mt-10 bg-[color:var(--c-ink-deep)] py-12 text-white">
        <div className="mx-auto grid w-full max-w-5xl gap-8 px-5 sm:px-8 md:grid-cols-2">
          <div className="text-sm leading-6 text-white/75">
            {companyLines().map((line, index) => <p key={line} className={index === 0 ? "font-black text-white" : ""}>{line}</p>)}
          </div>
          <div className="space-y-4 text-sm">
            <LegalLinks className="text-white/85" linkClassName="focus-visible:outline-white" />
            <a href={`mailto:${contactEmail}`} className="inline-flex items-center gap-2 font-bold text-white underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"><Mail size={16} aria-hidden="true" />{contactEmail}</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
