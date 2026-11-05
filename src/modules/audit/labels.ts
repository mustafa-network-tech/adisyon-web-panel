export type AuditCategory = "orders" | "payments" | "people" | "staff" | "payroll" | "settings";

export const auditCategories: { id: AuditCategory; label: string; prefixes: string[] }[] = [
  { id: "orders", label: "Siparişler ve indirimler", prefixes: ["order.", "order_item.", "kitchen."] },
  { id: "payments", label: "Ödeme ve kasa", prefixes: ["payment.", "cash."] },
  { id: "people", label: "Kullanıcılar ve yetkiler", prefixes: ["tenant.member", "tenant.invitation", "tenant.self_created"] },
  { id: "staff", label: "Personel ve vardiya", prefixes: ["staff.", "shift", "attendance."] },
  { id: "payroll", label: "Maaş ve prim", prefixes: ["payroll."] },
  { id: "settings", label: "Ayarlar, menü ve QR", prefixes: ["tenant.settings", "tenant.branch", "qr.", "tenant.context", "platform.", "onboarding.", "product.", "option_group.", "option_choice."] },
];

const actionLabels: Record<string, string> = {
  "order.opened": "Adisyon açıldı",
  "order.items_appended": "Adisyona ürün eklendi",
  "order.item_updated": "Adisyon kalemi güncellendi",
  "order.submitted": "Sipariş gönderildi",
  "order.customer_submitted": "Müşteri QR siparişi verdi",
  "order.discount_applied": "Adisyon indirimi uygulandı",
  "order.discount_removed": "Adisyon indirimi kaldırıldı",
  "order_item.discount_applied": "Ürün indirimi uygulandı",
  "order_item.discount_removed": "Ürün indirimi kaldırıldı",
  "order_item.voided": "Gönderilmiş ürün iptal edildi",
  "order_item.comped": "Ürün ikram edildi",
  "order.moved": "Adisyon başka masaya taşındı",
  "order.merged": "Adisyonlar birleştirildi",
  "kitchen.ticket_transitioned": "Mutfak fişi durumu değişti",
  "product.availability_changed": "Ürün tükendi durumu değişti",
  "option_group.saved": "Ürün seçenek grubu kaydedildi",
  "option_group.deleted": "Ürün seçenek grubu silindi",
  "option_choice.availability_changed": "Seçenek tükendi durumu değişti",
  "payment.recorded": "Ödeme alındı",
  "payment.refunded": "İade yapıldı",
  "cash.session_opened": "Kasa vardiyası açıldı",
  "cash.session_closed": "Kasa vardiyası kapatıldı",
  "cash.movement_recorded": "Kasa giriş/çıkışı kaydedildi",
  "tenant.invitation.created": "Davet oluşturuldu",
  "tenant.invitation.accepted": "Davet kabul edildi",
  "tenant.member_access.updated": "Kullanıcı rolü/erişimi değişti",
  "tenant.member_extras.updated": "Ek yetkiler değişti",
  "tenant.self_created": "İşletme oluşturuldu",
  "tenant.branch_created": "Şube eklendi",
  "onboarding.method_set": "Kurulum yöntemi seçildi",
  "onboarding.step_completed": "Kurulum adımı tamamlandı",
  "onboarding.trial_started": "7 günlük deneme başlatıldı",
  "platform.setup.status_changed": "Kurulum durumu değiştirildi (MK)",
  "platform.setup.areas_applied": "MK salonları oluşturdu",
  "platform.setup.tables_applied": "MK masaları oluşturdu",
  "platform.setup.stations_applied": "MK mutfak istasyonlarını oluşturdu",
  "platform.setup.menu_applied": "MK menüyü oluşturdu",
  "staff.profile_saved": "Personel kartı güncellendi",
  "shift.created": "Vardiya/izin eklendi",
  "shift.updated": "Vardiya/izin güncellendi",
  "shift.deleted": "Vardiya/izin silindi",
  "shift_template.saved": "Vardiya şablonu kaydedildi",
  "attendance.approved": "Puantaj onaylandı",
  "attendance.bulk_approved": "Puantaj toplu onaylandı",
  "payroll.pay_changed": "Personel ücreti değişti",
  "payroll.entry_added": "Prim/kesinti/avans eklendi",
  "payroll.entry_deleted": "Prim/kesinti/avans silindi",
  "tenant.settings.updated": "İşletme ayarları güncellendi",
  "qr.ordering_changed": "QR sipariş modu değişti",
  "qr.token_rotated": "Masa QR kodu yenilendi",
  "tenant.context.selected": "İşletme bağlamı seçildi",
  "platform.subscription.updated": "Abonelik güncellendi",
  "platform.member.assigned": "Platform üye atadı",
  "platform.support.opened": "Destek oturumu açıldı",
  "platform.support.closed": "Destek oturumu kapandı",
  "platform.tenant.provisioned": "İşletme oluşturuldu (platform)",
};

export function actionLabel(action: string) {
  return actionLabels[action] || action;
}

/** Action prefixes of a category, or null for "all". */
export function categoryPrefixes(category: string | undefined) {
  return auditCategories.find((item) => item.id === category)?.prefixes ?? null;
}

const metadataLabels: Record<string, string> = {
  reason: "Gerekçe",
  type: "Tür",
  status: "Durum",
  date: "Tarih",
  count: "Adet",
  kind: "Tür",
  movedItems: "Taşınan kalem",
  minutes: "Dakika",
  name: "Ad",
  soldOut: "Tükendi",
};

/** Short, human readable details; identifiers and internal keys are left out. */
export function summarizeMetadata(metadata: Record<string, unknown>) {
  const parts: string[] = [];
  for (const [key, label] of Object.entries(metadataLabels)) {
    const value = metadata[key];
    if (value === undefined || value === null || value === "") continue;
    if (typeof value === "object") continue;
    parts.push(`${label}: ${String(value)}`);
  }
  return parts.slice(0, 4).join(" · ");
}
