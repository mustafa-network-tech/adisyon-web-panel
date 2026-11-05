import { contactEmail } from "./site";

/**
 * Company details shown on the legal pages. Fill in the optional fields once the
 * registered details are final; empty fields are simply not shown.
 */
export const company = {
  /** Brand / trade name used on the site. */
  name: "MK Digital Systems",
  /** Registered company title, e.g. "... Bilişim Hizmetleri Ltd. Şti." */
  legalName: "",
  taxOffice: "",
  taxNumber: "",
  mersisNumber: "",
  address: "",
  email: contactEmail,
} as const;

/** Shown as "Son güncelleme" on every legal page. Update when a text changes. */
export const legalUpdatedAt = "2026-11-05";

export type LegalLink = { href: string; label: string };

export const legalLinks: LegalLink[] = [
  { href: "/kullanim-kosullari", label: "Kullanım Koşulları" },
  { href: "/gizlilik-politikasi", label: "Gizlilik Politikası" },
  { href: "/kvkk-aydinlatma-metni", label: "KVKK Aydınlatma Metni" },
  { href: "/cerez-politikasi", label: "Çerez Politikası" },
];

/** Lines that describe the company, only those that are filled in. */
export function companyLines() {
  const lines: string[] = [];
  lines.push(company.legalName || company.name);
  if (company.address) lines.push(company.address);
  if (company.taxOffice || company.taxNumber) {
    lines.push(`Vergi Dairesi / No: ${[company.taxOffice, company.taxNumber].filter(Boolean).join(" / ")}`);
  }
  if (company.mersisNumber) lines.push(`MERSİS No: ${company.mersisNumber}`);
  lines.push(`E-posta: ${company.email}`);
  return lines;
}
