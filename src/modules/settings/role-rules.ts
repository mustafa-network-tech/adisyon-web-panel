import { readOnlyMessage } from "@/modules/plan/usage";
/**
 * Role assignment rules. They are enforced in the database (update_tenant_member_access, decide_join_request;
 * migrations 0036, 0040, 0041); this file only explains them to the user and maps the database errors to
 * readable text.
 */
export const roleAssignmentRules = [
  "Rolleri yalnızca “Kullanıcılar ve roller” yetkisi olan kişiler atayabilir.",
  "Personel işletmeye davet bağlantısıyla değil, işletme adı ve katılım koduyla katılma talebi gönderir. Talep onaylanıp rol ve şube verilmeden hiçbir işletme verisine erişemez.",
  "İşletme Sahibi ve İşletme Yöneticisi rollerini yalnızca şirket (işletme) düzeyindeki yöneticiler verebilir; şube yöneticileri veremez.",
  "İşletme Sahibi rolünü yalnızca İşletme Sahibi verebilir veya değiştirebilir. Son işletme sahibi kaldırılamaz ya da askıya alınamaz.",
  "Şube düzeyindeki yetkililer yalnızca kendi şubelerindeki personele ve yalnızca şube düzeyindeki rollere (Müdür, Kasa, Mutfak, Garson) atama yapabilir.",
  "Birden fazla şubede çalışan bir personelin rolünü ve durumunu yalnızca şirket düzeyindeki yöneticiler değiştirir; şube yöneticisi yalnızca kendi şubesindeki atamayı düzenler.",
  "Askıdaki bir kullanıcıyı yalnızca şirket düzeyindeki yöneticiler yeniden etkinleştirebilir; katılım kodu askıdaki veya reddedilen kullanıcıya erişim vermez.",
  "Paketin kullanıcı sınırı, personel onaylandığında ve yeniden etkinleştirildiğinde kontrol edilir. Birden fazla şubede çalışan kişi tek kullanıcı sayılır.",
  "Hiç kimse kendi rolünü değiştiremez ve kendi hesabını askıya alamaz; bu işlem için ikinci bir yetkili gerekir.",
  "Ek yetkiler (ayarlar, menü, geçmiş raporlar, puantaj, maaş, kasada indirim vb.) yalnızca şirket düzeyindeki yöneticiler tarafından verilir. İndirim yetkisi tek başına yetmez: indirim yalnızca kasada ödeme alırken yapılır.",
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
  reactivation_requires_tenant_scope: "Askıdaki bir kullanıcıyı yalnızca şirket yöneticisi yeniden etkinleştirebilir. Lütfen işletme yöneticinizden isteyin.",
  member_outside_actor_branches: "Yalnızca kendi şubelerinizdeki personelin erişimini değiştirebilirsiniz.",
  member_spans_other_branches: "Bu kişi başka şubelerde de çalışıyor. Rolünü ve durumunu yalnızca şirket yöneticisi değiştirebilir; siz yalnızca kendi şubenizdeki atamayı düzenleyebilirsiniz.",
  role_exceeds_actor_permissions: "Kendi yetkilerinizi aşan bir rol veremezsiniz.",
  user_limit_reached: "Paketinizin kullanıcı sınırına ulaştınız. Önce bir kullanıcıyı askıya alın veya paketinizi yükseltin.",
};

export function memberAccessErrorMessage(message: string | undefined) {
  const code = message ? Object.keys(accessErrors).find((item) => message.includes(item)) : undefined;
  return code ? accessErrors[code] : "Kullanıcı erişimi güncellenemedi. Rol kurallarını kontrol edin.";
}

const joinDecisionErrors: Record<string, string> = {
  ...accessErrors,
  join_request_not_found: "Talep bulunamadı.",
  join_request_already_decided: "Bu talep zaten sonuçlandırılmış.",
  already_member: "Bu kullanıcı zaten işletmenin üyesi.",
  role_not_found: "Seçilen rol bulunamadı.",
};

export function joinDecisionErrorMessage(message: string | undefined) {
  const code = message ? Object.keys(joinDecisionErrors).find((item) => message.includes(item)) : undefined;
  return code ? joinDecisionErrors[code] : "Talep sonuçlandırılamadı. Rol ve şube seçimini kontrol edin.";
}

/** What a person who asked to join sees (answers of request_join_tenant). */
export const joinWaitingMessage =
  "İşletmeye katılımınız alındı. Henüz görev ve yetkileriniz tanımlanmadı. Lütfen yöneticinizin onayını bekleyin veya yöneticinizle iletişime geçin.";

const joinRequestErrors: Record<string, string> = {
  invalid_code: "İşletme adı veya katılım kodu hatalı. Bilgileri yöneticinizden kontrol edin.",
  rate_limited: "Çok fazla hatalı deneme yaptınız. Lütfen 15 dakika sonra tekrar deneyin.",
  join_not_allowed: "Bu işletmeye katılma talebiniz kabul edilemiyor. Lütfen işletme yöneticinizle iletişime geçin.",
  already_member: "Bu işletmenin zaten üyesisiniz.",
  authentication_required: "Devam etmek için giriş yapın.",
};

export function joinRequestErrorMessage(codeOrMessage: string | undefined) {
  const code = codeOrMessage ? Object.keys(joinRequestErrors).find((item) => codeOrMessage.includes(item)) : undefined;
  return code ? joinRequestErrors[code] : "Katılma talebi gönderilemedi. Lütfen tekrar deneyin.";
}

export type MemberStatus = "active" | "invited" | "suspended";

/**
 * Status choices offered for a member. The database refuses a branch-scope manager who sets a
 * suspended member back to active (reactivation_requires_tenant_scope); the screen simply does not
 * offer that choice. This is only a convenience: the database rule is what protects the data.
 */
export function statusOptionsFor(current: MemberStatus, isTenantScope: boolean): MemberStatus[] {
  if (current === "suspended" && !isTenantScope) return ["suspended"];
  return ["active", "suspended", "invited"];
}
