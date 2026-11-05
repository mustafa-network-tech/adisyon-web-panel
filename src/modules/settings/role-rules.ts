import { readOnlyMessage } from "@/modules/plan/usage";
/**
 * Role assignment rules. They are enforced in the database by
 * public.update_tenant_member_access (migrations 0011 and 0017); this file only
 * explains them to the user and maps the database errors to readable text.
 */
export const roleAssignmentRules = [
  "Rolleri yalnızca “Kullanıcılar ve roller” yetkisi olan kişiler atayabilir.",
  "İşletme Sahibi ve İşletme Yöneticisi rollerini yalnızca şirket (işletme) düzeyindeki yöneticiler verebilir; şube yöneticileri veremez.",
  "İşletme Sahibi rolünü yalnızca İşletme Sahibi verebilir veya değiştirebilir. Son işletme sahibi kaldırılamaz ya da askıya alınamaz.",
  "Şube düzeyindeki yetkililer yalnızca kendi şubelerindeki personele ve yalnızca şube düzeyindeki rollere (Müdür, Kasa, Mutfak, Garson) atama yapabilir.",
  "Hiç kimse kendi rolünü değiştiremez ve kendi hesabını askıya alamaz; bu işlem için ikinci bir yetkili gerekir.",
  "Ek yetkiler (ayarlar, menü, geçmiş raporlar vb.) yalnızca şirket düzeyindeki yöneticiler tarafından verilir.",
  "Puantaj (günlük çalışma süresi) onayı varsayılan olarak yalnızca şirket yöneticisinde ve işletme sahibindedir; müdür ancak şirket yöneticisi “Puantaj onayı” ek yetkisini verirse onaylayabilir.",
  "Maaş, prim ve personel kartı (acil durum kişisi, notlar) bilgilerini yalnızca şirket düzeyindeki yöneticiler görür.",
  "Her rol ve erişim değişikliği denetim (audit) kaydına yazılır.",
] as const;

const accessErrors: Record<string, string> = {
  tenant_read_only: readOnlyMessage,
  users_manage_denied: "Kullanıcı yönetimi yetkiniz yok.",
  member_access_required: "En az bir şube ve bir rol seçin.",
  cross_tenant_member_access: "Seçilen şube veya rol bu işletmeye ait değil.",
  cannot_suspend_self: "Kendi hesabınızı askıya alamazsınız.",
  cannot_change_own_roles: "Kendi rolünüzü değiştiremezsiniz; başka bir yetkiliden isteyin.",
  tenant_role_assignment_denied: "İşletme düzeyindeki rolleri yalnızca şirket yöneticisi verebilir.",
  tenant_member_change_denied: "İşletme düzeyindeki bir yöneticinin erişimini yalnızca şirket yöneticisi değiştirebilir.",
  branch_assignment_denied: "Yalnızca kendi şubelerinize atama yapabilirsiniz.",
  owner_role_assignment_denied: "İşletme Sahibi rolünü yalnızca işletme sahibi verebilir.",
  owner_membership_change_denied: "İşletme sahibinin erişimini yalnızca başka bir işletme sahibi değiştirebilir.",
  last_owner_required: "Son işletme sahibi kaldırılamaz veya askıya alınamaz.",
};

export function memberAccessErrorMessage(message: string | undefined) {
  const code = message ? Object.keys(accessErrors).find((item) => message.includes(item)) : undefined;
  return code ? accessErrors[code] : "Kullanıcı erişimi güncellenemedi. Rol kurallarını kontrol edin.";
}
