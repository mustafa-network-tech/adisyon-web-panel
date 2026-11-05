"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser, requireWorkspacePermission } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SettingsActionState } from "./management-types";
import { memberAccessErrorMessage } from "./role-rules";
import { invitationSchema, memberAccessSchema, memberExtrasSchema, tenantConfigurationSchema } from "./validation";
import { isReadOnlyError, readOnlyMessage } from "@/modules/plan/usage";

const errorState = (message: string): SettingsActionState => ({ status: "error", message });
const successState = (message: string, invitationUrl?: string): SettingsActionState => ({ status: "success", message, invitationUrl });

function readRoute(formData: FormData) {
  const tenant = formData.get("tenant");
  const branch = formData.get("branch");
  return typeof tenant === "string" && typeof branch === "string" ? { tenant, branch } : null;
}

export async function saveTenantConfigurationAction(
  _state: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const route = readRoute(formData);
  if (!route) return errorState("Çalışma alanı bilgisi eksik.");
  const context = await requireWorkspacePermission(route.tenant, route.branch, ["settings.manage"]);
  const values = tenantConfigurationSchema.safeParse({
    tenantName: formData.get("tenantName"), legalName: formData.get("legalName") || "",
    branchName: formData.get("branchName"), brandName: formData.get("brandName"),
    primaryColor: formData.get("primaryColor"), orderNumberPrefix: formData.get("orderNumberPrefix"),
    receiptFooter: formData.get("receiptFooter") || "", serviceChargePercent: formData.get("serviceChargePercent"),
  });
  if (!values.success) return errorState("İşletme ayarlarını kontrol edin.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_tenant_configuration", {
    target_tenant_id: context.tenantId, target_branch_id: context.branchId,
    target_tenant_name: values.data.tenantName, target_legal_name: values.data.legalName,
    target_branch_name: values.data.branchName, target_brand_name: values.data.brandName,
    target_primary_color: values.data.primaryColor, target_order_prefix: values.data.orderNumberPrefix,
    target_receipt_footer: values.data.receiptFooter,
    target_service_charge_basis_points: Math.round(values.data.serviceChargePercent * 100),
  });
  if (isReadOnlyError(error?.message)) return errorState(readOnlyMessage);
  if (error) return errorState("Ayarlar kaydedilemedi. Yetkinizi ve alanları kontrol edin.");
  revalidatePath(`/app/${route.tenant}/${route.branch}`);
  return successState("İşletme ve şube ayarları kaydedildi.");
}

export async function createInvitationAction(
  _state: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const route = readRoute(formData);
  if (!route) return errorState("Çalışma alanı bilgisi eksik.");
  const context = await requireWorkspacePermission(route.tenant, route.branch, ["users.manage"]);
  const values = invitationSchema.safeParse({
    email: formData.get("email"), roleId: formData.get("roleId"), validHours: formData.get("validHours"),
  });
  if (!values.success) return errorState("Davet bilgilerini kontrol edin.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_tenant_invitation", {
    target_tenant_id: context.tenantId, target_branch_id: context.branchId,
    target_email: values.data.email, target_role_id: values.data.roleId,
    target_valid_hours: values.data.validHours,
  });
  if (error || !data || typeof data !== "object" || !("token" in data)) {
    return errorState("Davet oluşturulamadı. Rol ve yetkinizi kontrol edin.");
  }
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") || headerStore.get("host");
  const protocol = headerStore.get("x-forwarded-proto") || "https";
  const path = `/davet/${String(data.token)}`;
  const invitationUrl = host ? `${protocol}://${host}${path}` : path;
  revalidatePath(`/app/${route.tenant}/${route.branch}/ayarlar/kullanicilar`);
  return successState("Davet oluşturuldu. Bağlantıyı güvenli biçimde paylaşın.", invitationUrl);
}

export async function updateMemberAccessAction(
  _state: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const route = readRoute(formData);
  if (!route) return errorState("Çalışma alanı bilgisi eksik.");
  const context = await requireWorkspacePermission(route.tenant, route.branch, ["users.manage"]);
  const values = memberAccessSchema.safeParse({
    membershipId: formData.get("membershipId"), status: formData.get("status"),
    roleId: formData.get("roleId"), branchIds: formData.getAll("branchIds"),
  });
  if (!values.success) return errorState("En az bir şube ve geçerli bir rol seçin.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_tenant_member_access", {
    target_tenant_id: context.tenantId, target_membership_id: values.data.membershipId,
    target_status: values.data.status, target_branch_ids: values.data.branchIds,
    target_role_ids: [values.data.roleId],
  });
  if (error) return errorState(memberAccessErrorMessage(error.message));
  revalidatePath(`/app/${route.tenant}/${route.branch}/ayarlar/kullanicilar`);
  return successState("Kullanıcı rolü ve şube erişimi güncellendi.");
}

export async function setMemberExtrasAction(
  _state: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const route = readRoute(formData);
  if (!route) return errorState("Çalışma alanı bilgisi eksik.");
  const context = await requireWorkspacePermission(route.tenant, route.branch, ["users.manage"]);
  const values = memberExtrasSchema.safeParse({
    membershipId: formData.get("membershipId"),
    permissionCodes: formData.getAll("permissionCodes"),
    stationIds: formData.getAll("stationIds"),
  });
  if (!values.success) return errorState("Ek yetki bilgilerini kontrol edin.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_member_extras", {
    target_tenant_id: context.tenantId, target_membership_id: values.data.membershipId,
    target_permission_codes: values.data.permissionCodes, target_station_ids: values.data.stationIds,
  });
  if (error) return errorState("Ek yetkiler kaydedilemedi. Bu işlem yalnızca işletme sahibi veya işletme yöneticisi tarafından yapılabilir.");
  revalidatePath(`/app/${route.tenant}/${route.branch}/ayarlar/kullanicilar`);
  return successState("Ek yetkiler ve mutfak istasyonları güncellendi.");
}

export async function acceptInvitationAction(
  _state: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const token = formData.get("token");
  if (typeof token !== "string" || token.length < 32) return errorState("Davet bağlantısı geçersiz.");
  await requireAuthenticatedUser(`/davet/${token}`);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("accept_tenant_invitation", { target_token: token });
  if (error || !data || typeof data !== "object" || !("tenantSlug" in data) || !("branchSlug" in data)) {
    return errorState("Davet kabul edilemedi. Oturum e-postası davetle aynı olmalıdır.");
  }
  redirect(`/app/${String(data.tenantSlug)}/${String(data.branchSlug)}/masalar`);
}
