import { contactEmail } from "./site";

/** What helps us solve a problem quickly; also pre-filled in the support e-mail. */
export const supportTemplateLines = [
  "İşletme ve şube adınız",
  "Giriş yaptığınız e-posta adresi",
  "Sorunun yaşandığı ekran ve saat",
  "Ne yapmak istediniz, ne oldu? Varsa ekran görüntüsü",
];

type SupportContext = { business?: string; branch?: string; user?: string };

/**
 * mailto link with a ready subject and body. From the panel the business,
 * branch and user are filled in, so support does not have to ask for them.
 */
export function supportMailto(context: SupportContext = {}) {
  const subject = context.business ? `MK Adisyon destek - ${context.business}` : "MK Adisyon destek talebi";
  const body = [
    `İşletme: ${context.business ?? ""}`,
    `Şube: ${context.branch ?? ""}`,
    `Kullanıcı: ${context.user ?? ""}`,
    "Ekran / saat:",
    "",
    "Sorun veya talebiniz:",
    "",
  ].join("\n");
  return `mailto:${contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
