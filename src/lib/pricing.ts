/**
 * Public price list shown on the marketing page.
 * Prices are TL per month and exclude VAT. Subscriptions are activated by hand,
 * so there is no online payment: this file only feeds the pricing section.
 */

/** Last day a business can start a subscription at the launch price (inclusive). */
export const LAUNCH_DEADLINE = "2027-04-30";

/** Months the launch price applies from the subscription start. */
export const LAUNCH_MONTHS = 6;

export type PricingPlan = {
  id: "baslangic" | "profesyonel" | "cok-subeli";
  name: string;
  tagline: string;
  /** Launch price (first LAUNCH_MONTHS months) in TL per month. */
  launchPrice: number;
  /** Regular price in TL per month. */
  regularPrice: number;
  featured?: boolean;
  features: string[];
};

export const pricingPlans: PricingPlan[] = [
  {
    id: "baslangic",
    name: "Başlangıç",
    tagline: "Tek şubeli, küçük ve orta ölçekli işletmeler için",
    launchPrice: 229,
    regularPrice: 449,
    features: [
      "1 şube",
      "En fazla 15 masa",
      "En fazla 5 personel hesabı",
      "Tek mutfak istasyonu",
      "Masa ve adisyon yönetimi",
      "Garson, mutfak ve kasa ekranları",
      "Temel satış ve gün sonu raporları",
      "Standart destek",
    ],
  },
  {
    id: "profesyonel",
    name: "Profesyonel",
    tagline: "Yoğun servisi olan, büyüyen işletmeler için",
    launchPrice: 449,
    regularPrice: 749,
    featured: true,
    features: [
      "1 şube",
      "Sınırsız masa",
      "En fazla 15 personel hesabı",
      "Birden fazla mutfak istasyonu (mutfak, ızgara, fırın…)",
      "Gelişmiş kullanıcı rolleri ve yetkilendirme",
      "Ayrıntılı satış, ürün, kategori ve personel raporları",
      "Öncelikli destek",
    ],
  },
  {
    id: "cok-subeli",
    name: "Çok Şubeli",
    tagline: "Birden fazla şubesi olan işletmeler için",
    launchPrice: 799,
    regularPrice: 1249,
    features: [
      "3 şubeye kadar kullanım",
      "Sınırsız masa",
      "En fazla 40 personel hesabı",
      "Birden fazla mutfak istasyonu",
      "Tek işletme altında birden fazla şube",
      "Şube bazlı kullanıcı yetkileri",
      "Öncelikli kurulum ve destek",
    ],
  },
];

/** Included in every plan. */
export const includedInAllPlans = [
  "Her masaya özel QR kod",
  "Dinamik QR menü",
  "Müşterinin masadan sipariş verebilmesi",
  "QR sipariş özelliğini açma veya kapatma",
  "QR siparişleri doğrudan mutfağa iletilir",
  "Garson tarafından manuel sipariş girişi",
  "Nakit, kart, karma ödeme ve hesap bölme",
  "Telefon, tablet ve masaüstü erişimi",
  "QR siparişlerinden komisyon alınmaz",
];

/** "1.249 TL" - Turkish thousands separator, no decimals. */
export function formatTl(amount: number) {
  return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(amount)} TL`;
}

/** Today's date in Turkey as YYYY-MM-DD. */
function turkishToday(now: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** The launch price is shown only up to and including the deadline day. */
export function isLaunchCampaignActive(now: Date = new Date()) {
  return turkishToday(now) <= LAUNCH_DEADLINE;
}

/** "30 Nisan 2027" */
export function launchDeadlineText() {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${LAUNCH_DEADLINE}T12:00:00Z`));
}
