import Link from "next/link";
import { legalLinks } from "@/lib/legal";

/** Legal page links, used in footers and next to sign-up forms. */
export function LegalLinks({ className = "", linkClassName = "" }: { className?: string; linkClassName?: string }) {
  return (
    <nav aria-label="Yasal bağlantılar" className={className}>
      <ul className="flex flex-wrap gap-x-5 gap-y-2">
        {legalLinks.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className={`underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 ${linkClassName}`}>
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
