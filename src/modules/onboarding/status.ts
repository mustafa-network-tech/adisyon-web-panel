/**
 * Setup (onboarding) states. The first seven are stored in tenant_onboarding.status;
 * the last three are derived from the subscription and the trial start time, so
 * the existing subscription stays the single source of truth for the trial dates.
 */

export type SetupStatus =
  | "method_pending"
  | "self_in_progress"
  | "assisted_requested"
  | "info_needed"
  | "assisted_in_progress"
  | "setup_completed"
  | "trial_ready";

export type DerivedStatus = SetupStatus | "trial_active" | "trial_ended" | "subscription_active";

export type SetupMethod = "self" | "assisted";

export const statusLabels: Record<DerivedStatus, string> = {
  method_pending: "Kurulum yöntemi seçilmedi",
  self_in_progress: "İşletme tarafından hazırlanıyor",
  assisted_requested: "Kurulum desteği talep edildi",
  info_needed: "Bilgi bekleniyor",
  assisted_in_progress: "MK Digital Systems tarafından hazırlanıyor",
  setup_completed: "Kurulum tamamlandı",
  trial_ready: "Denemeye hazır",
  trial_active: "Deneme aktif",
  trial_ended: "Deneme sona erdi",
  subscription_active: "Abonelik aktif",
};

export type SetupStep = "areas" | "tables" | "stations" | "menu";

export const setupSteps: { id: SetupStep; label: string; short: string; help: string }[] = [
  { id: "areas", label: "Salonlar", short: "Salonlar", help: "Salon, bahçe, teras gibi servis alanlarınızı ekleyin." },
  { id: "tables", label: "Masalar", short: "Masalar", help: "Her salon için masalarınızı ekleyin. Her masa için QR kod otomatik oluşur." },
  { id: "stations", label: "Mutfak istasyonları", short: "İstasyonlar", help: "Mutfak, ızgara, bar gibi hazırlık bölümlerinizi kontrol edin." },
  { id: "menu", label: "Menü", short: "Menü", help: "Kategorilerinizi ve ürünlerinizi fiyatlarıyla ekleyin; her ürünü bir istasyona bağlayın." },
];

export type Readiness = Record<SetupStep, boolean>;

export type OnboardingState = {
  tenantId: string;
  branchId: string;
  selectedPlan: "START" | "PRO" | "MULTI";
  method: SetupMethod | null;
  status: SetupStatus;
  currentStep: number;
  completedSteps: SetupStep[];
  requestPayload: Partial<Record<"details" | "areas" | "tables" | "stations" | "menu" | "notes", string>>;
  adminNote: string | null;
  trialStartedAt: string | null;
};

export type SubscriptionLite = { status: "trial" | "active" | "suspended" | "cancelled"; endsAt: string | null } | null;

export function deriveStatus(state: Pick<OnboardingState, "status" | "trialStartedAt">, subscription: SubscriptionLite, now: Date = new Date()): DerivedStatus {
  if (subscription?.status === "active" && (!subscription.endsAt || new Date(subscription.endsAt) > now)) {
    return "subscription_active";
  }
  if (state.trialStartedAt) {
    if (subscription?.status === "trial" && subscription.endsAt && new Date(subscription.endsAt) > now) return "trial_active";
    return "trial_ended";
  }
  return state.status;
}

/** Statuses a platform administrator may move an assisted setup to, from each status. */
export function platformNextStatuses(status: SetupStatus, method: SetupMethod | null = "assisted"): SetupStatus[] {
  // A business that has not asked for help (message came by WhatsApp / e-mail) can be taken over.
  if (method !== "assisted") return status === "method_pending" || status === "self_in_progress" ? ["assisted_in_progress"] : [];
  switch (status) {
    case "assisted_requested":
      return ["assisted_in_progress", "info_needed"];
    case "info_needed":
      return ["assisted_in_progress"];
    case "assisted_in_progress":
      return ["info_needed", "setup_completed"];
    case "setup_completed":
      return ["assisted_in_progress", "trial_ready"];
    default:
      return [];
  }
}

/** Assisted setup can still be changed by the platform only in these statuses. */
export function isAssistedOpen(status: SetupStatus, method: SetupMethod | null, trialStartedAt: string | null) {
  return method === "assisted" && !trialStartedAt && (status === "assisted_requested" || status === "info_needed" || status === "assisted_in_progress");
}

export function allStepsReady(readiness: Readiness) {
  return setupSteps.every((step) => readiness[step.id]);
}

/** First step that is not completed yet (1-based); 4 when all are done. */
export function firstOpenStep(completed: readonly SetupStep[]) {
  const index = setupSteps.findIndex((step) => !completed.includes(step.id));
  return index === -1 ? 4 : index + 1;
}

/** The step to show: a requested one is allowed when it is not ahead of the first open step. */
export function resolveStep(requested: number | null, state: Pick<OnboardingState, "currentStep" | "completedSteps">) {
  const furthest = firstOpenStep(state.completedSteps);
  if (requested && requested >= 1 && requested <= 4 && requested <= furthest) return requested;
  return Math.min(Math.max(state.currentStep, 1), furthest);
}

const errorMessages: Record<string, string> = {
  owner_required: "Bu işlemi yalnızca işletme sahibi yapabilir.",
  platform_admin_required: "Bu işlem için platform yönetici yetkisi gerekir.",
  onboarding_not_found: "Bu işletme için kurulum kaydı bulunamadı.",
  setup_method_locked: "Kurulum yöntemi bu aşamada değiştirilemez.",
  invalid_setup_request: "Kurulum bilgilerini yazın (salonlar, masalar, mutfak istasyonları ve menü).",
  invalid_setup_method: "Kurulum yöntemi geçersiz.",
  setup_step_not_allowed: "Bu işlem şu anki kurulum durumunda yapılamaz.",
  invalid_setup_step: "Kurulum adımı geçersiz.",
  setup_step_incomplete: "Bu adımı tamamlamak için en az bir kayıt eklemelisiniz.",
  trial_not_ready: "Deneme, dört kurulum adımı tamamlanmadan başlatılamaz.",
  trial_already_started: "Bu işletmenin ücretsiz denemesi zaten başlatıldı.",
  trial_not_available: "Deneme bu işletme için başlatılamıyor.",
  assisted_setup_not_open: "Bu işletmenin destekli kurulumu şu anda düzenlemeye açık değil.",
  invalid_status_transition: "Bu durum geçişine izin verilmiyor.",
  info_note_required: "Eksik bilgi talebi için en az 5 karakterlik bir not yazın.",
  setup_incomplete: "Dört alanın da kayıtları tamamlanmadan işletme denemeye hazır yapılamaz.",
  invalid_setup_items: "Gönderilen kayıtlarda geçersiz değer var. Satırları kontrol edin.",
  setup_area_not_found: "Masa için belirtilen salon bulunamadı. Önce salonları oluşturun.",
  setup_station_not_found: "Ürün için belirtilen mutfak istasyonu bulunamadı. Önce istasyonu oluşturun.",
  no_info_request: "Bu işletmede bekleyen bir bilgi talebi yok.",
  table_limit_reached: "Paketin masa sınırına ulaşıldı.",
  station_limit_reached: "Paketin mutfak istasyonu sınırına ulaşıldı.",
  invalid_plan: "Seçilen paket geçersiz.",
  tenant_not_found: "İşletme veya şubesi bulunamadı.",
};

/** Turkish message for a database error raised by the setup functions. */
export function setupErrorMessage(message: string | undefined, fallback = "İşlem tamamlanamadı. Lütfen tekrar deneyin.") {
  if (!message) return fallback;
  const key = Object.keys(errorMessages).find((code) => message.includes(code));
  return key ? errorMessages[key] : fallback;
}
