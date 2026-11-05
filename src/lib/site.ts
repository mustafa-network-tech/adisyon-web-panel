/** Public address of the site; used for absolute links in social previews and search engines. */
export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://adisyonweb.com").replace(/\/+$/, "");

export const siteName = "MK Adisyon";

export const siteTitle = "MK Adisyon | Restoran, kafe ve bar için adisyon programı";

/** One description for search results and social cards (about 150 characters). */
export const siteDescription =
  "Masa, sipariş, mutfak ve kasayı tek ekranda yönetin. QR menü, garson çağırma, mutfak ekranı, kasa ve raporlar bulutta, kurulumsuz.";

/** Square app icon reused as the share image (512 x 512). */
export const shareImage = {
  url: "/icons/app-icon-512.png",
  width: 512,
  height: 512,
  alt: "MK Adisyon logosu",
};

/** Contact and support address (the same mailbox for both). */
export const contactEmail = "iletisim@mk-digitalsystems.com";
