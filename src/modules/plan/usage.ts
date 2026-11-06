import { contactEmail } from "@/lib/site";
import { istanbulDay, subscriptionEnded } from "@/lib/subscription-time";

export type PlanUsage = {
  planCode: string | null;
  status: "trial" | "active" | "suspended" | "cancelled" | null;
  /** ISO time the subscription ends (trial end), or null when open ended. */
  endsAt: string | null;
  userLimit: number | null;
  branchLimit: number | null;
  /** null = unlimited */
  tableLimit: number | null;
  stationLimit: number | null;
  tablesUsed: number;
  stationsUsed: number;
  /** False once the trial or subscription has ended (read-only mode). */
  writable: boolean;
  /** First setup not finished and the trial has not started: operations are not open yet. */
  setupPending: boolean;
};

/** "7 / 15" or "7 (sınırsız)". */
export function usageText(used: number, limit: number | null) {
  return limit === null ? `${used} (sınırsız)` : `${used} / ${limit}`;
}

export function isLimitReached(used: number, limit: number | null) {
  return limit !== null && used >= limit;
}

/** Whole days left until `endsAt` (0 when it already ended); null when there is no end date. */
export function daysLeft(endsAt: string | null, now: Date = new Date()) {
  if (!endsAt) return null;
  // counted in Istanbul calendar days: the last day itself still counts as 1 (it works until 23:59:59)
  if (subscriptionEnded(endsAt, now)) return 0;
  const end = Date.parse(`${istanbulDay(endsAt)}T00:00:00Z`);
  const today = Date.parse(`${istanbulDay(now)}T00:00:00Z`);
  return Math.round((end - today) / 86_400_000) + 1;
}

export function limitReachedMessage(kind: "table" | "station", limit: number | null) {
  const what = kind === "table" ? "masa" : "mutfak istasyonu";
  const count = limit === null ? "" : ` (${limit})`;
  return `Paketinizin ${what} sınırına ulaştınız${count}. Paketinizi yükseltmek için ${contactEmail} adresine yazın.`;
}

/** Friendly plan name for the panel; unknown codes are shown as written. */
export function planName(planCode: string | null) {
  const names: Record<string, string> = {
    TRIAL: "Deneme",
    START: "Başlangıç",
    BASLANGIC: "Başlangıç",
    PRO: "Profesyonel",
    PROFESYONEL: "Profesyonel",
    MULTI: "Çok Şubeli",
    COK_SUBELI: "Çok Şubeli",
  };
  if (!planCode) return "Tanımsız";
  return names[planCode.toUpperCase()] || planCode;
}

/** Limits a plan code stands for, used to prefill the platform form. */
export const planPresets = {
  TRIAL: { userLimit: 5, branchLimit: 1, tableLimit: 15, stationLimit: 3 },
  START: { userLimit: 5, branchLimit: 1, tableLimit: 15, stationLimit: 1 },
  PRO: { userLimit: 15, branchLimit: 1, tableLimit: null, stationLimit: null },
  MULTI: { userLimit: 40, branchLimit: 3, tableLimit: null, stationLimit: null },
} as const;

export type PlanPresetCode = keyof typeof planPresets;

/** What every write attempt answers once the trial or subscription has ended. */
export const readOnlyMessage = `Deneme veya abonelik süreniz doldu; hesabınız salt okunur. Etkinleştirmek için ${contactEmail} adresine yazın.`;

export function isReadOnlyError(message: string | undefined) {
  return Boolean(message?.includes("tenant_read_only"));
}

/** Operations (orders, payments, QR orders) open once the owner starts the trial. */
export const setupPendingMessage = "Önce ilk kurulumu tamamlayıp denemeyi başlatın; sipariş ve ödeme işlemleri deneme başladıktan sonra açılır.";

export function isSetupPendingError(message: string | undefined) {
  return Boolean(message?.includes("tenant_setup_pending"));
}

/** "Ücretsiz denemenizin bitmesine 5 gün kaldı." */
export function trialCountdownText(days: number) {
  return days === 0 ? "Ücretsiz deneme süreniz doldu." : `Ücretsiz denemenizin bitmesine ${days} gün kaldı.`;
}

/** Banner text for the panel. */
export function readOnlyBanner(status: PlanUsage["status"]) {
  const what = status === "trial" ? "Deneme süreniz" : "Abonelik süreniz";
  return `${what} doldu. Hesabınız salt okunur: bilgilerinizi görebilirsiniz ancak yeni kayıt yapılamaz.`;
}

/** Value for an <input type="datetime-local"> in the browser's local time. */
export function toLocalInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Same time `months` later (a 31st becomes the last day of a shorter month). */
export function addMonthsLocal(localInput: string, months: number) {
  const start = new Date(localInput);
  if (Number.isNaN(start.getTime())) return "";
  const target = new Date(start.getFullYear(), start.getMonth() + months, 1, start.getHours(), start.getMinutes());
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(start.getDate(), lastDay));
  return toLocalInput(target);
}

/** The ISO instant the server stores; empty for an empty or invalid input. */
export function localInputToIso(localInput: string) {
  const date = new Date(localInput);
  return localInput && !Number.isNaN(date.getTime()) ? date.toISOString() : "";
}
