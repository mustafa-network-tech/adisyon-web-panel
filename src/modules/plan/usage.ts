import { contactEmail } from "@/lib/site";

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
  const milliseconds = new Date(endsAt).getTime() - now.getTime();
  return Math.max(0, Math.ceil(milliseconds / 86_400_000));
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
