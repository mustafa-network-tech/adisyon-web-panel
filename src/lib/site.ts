/**
 * Public (canonical) address of the site. Always the www host: the apex domain
 * redirects to it, so every canonical URL, sitemap entry and JSON-LD id uses www.
 */
export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.adisyonweb.com").replace(/\/+$/, "");

export const siteName = "Adisyon Web";

/** Home page title (absolute: the "| Adisyon Web" template is not appended). */
export const siteTitle = "Adisyon Programı ve Restoran Otomasyonu | Adisyon Web";

/** One description for search results and social cards (about 150 characters). */
export const siteDescription =
  "Masa, sipariş, mutfak ve kasayı tek ekranda yönetin. Masaya özel QR menü ve QR sipariş dahil, bulut tabanlı adisyon programı ve restoran otomasyonu.";

/** Share image for social previews and search (1200 x 630). */
export const shareImage = {
  url: "/og/adisyon-web.png",
  width: 1200,
  height: 630,
  alt: "Adisyon Web: restoran için adisyon programı ve QR menü",
};

/** Contact and support address (the same mailbox for both). */
export const contactEmail = "iletisim@mk-digitalsystems.com";

/** WhatsApp contact number: international format, digits only. */
export const whatsappNumber = "905456597551";

/** Number as shown to people. */
export const whatsappDisplay = "+90 545 659 75 51";

/** wa.me link with an optional ready message. */
export function whatsappLink(message = "Merhaba, Adisyon Web hakkında bilgi almak istiyorum.") {
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
}
