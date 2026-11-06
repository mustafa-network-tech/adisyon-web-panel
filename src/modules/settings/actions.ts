"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspacePermission } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SettingsActionState } from "./management-types";
import { joinDecisionErrorMessage, memberAccessErrorMessage } from "./role-rules";
import { joinDecisionSchema, memberAccessSchema, memberExtrasSchema, tenantConfigurationSchema } from "./validation";
import { isReadOnlyError, readOnlyMessage } from "@/modules/plan/usage";

const errorState = (message: string): SettingsActionState => ({ status: "error", message });
const successState = (message: string): SettingsActionState => ({ status: "success", message });

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
    receiptFooter: formData.get("receiptFooter") || "",
  });
  if (!values.success) return errorState("İşletme ayarlarını kontrol edin.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_tenant_configuration", {
    target_tenant_id: context.tenantId, target_branch_id: context.branchId,
    target_tenant_name: values.data.tenantName, target_legal_name: values.data.legalName,
    target_branch_name: values.data.branchName, target_brand_name: values.data.brandName,
    target_primary_color: values.data.primaryColor, target_order_prefix: values.data.orderNumberPrefix,
    target_receipt_footer: values.data.receiptFooter,
  });
  if (isReadOnlyError(error?.message)) return errorState(readOnlyMessage);
  if (error) return errorState("Ayarlar kaydedilemedi. Yetkinizi ve alanları kontrol edin.");
  revalidatePath(`/app/${route.tenant}/${route.branch}`);
  return successState("İşletme ve şube ayarları kaydedildi.");
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

/** A manager approves (role + branches) or rejects somebody who asked to join with the business code. */
export async function decideJoinRequestAction(
  _state: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const route = readRoute(formData);
  if (!route) return errorState("Çalışma alanı bilgisi eksik.");
  await requireWorkspacePermission(route.tenant, route.branch, ["users.manage"]);
  const values = joinDecisionSchema.safeParse({
    requestId: formData.get("requestId"),
    decision: formData.get("decision"),
    roleId: formData.get("roleId") || undefined,
    branchIds: formData.getAll("branchIds"),
  });
  if (!values.success) return errorState("Talep bilgilerini kontrol edin.");
  if (values.data.decision === "approve" && (!values.data.roleId || values.data.branchIds.length === 0)) {
    return errorState("Onaylamak için bir rol ve en az bir şube seçin.");
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("decide_join_request", {
    target_request_id: values.data.requestId,
    target_decision: values.data.decision,
    target_role_id: values.data.roleId ?? null,
    target_branch_ids: values.data.branchIds,
  });
  if (error) return errorState(joinDecisionErrorMessage(error.message));
  revalidatePath(`/app/${route.tenant}/${route.branch}/ayarlar/kullanicilar`);
  return successState(values.data.decision === "approve" ? "Talep onaylandı. Kullanıcı artık yetkileriyle çalışabilir." : "Talep reddedildi.");
}

/** The owner renews the business code; the old code stops working at once. */
export async function rotateJoinCodeAction(
  _state: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const route = readRoute(formData);
  if (!route) return errorState("Çalışma alanı bilgisi eksik.");
  const context = await requireWorkspacePermission(route.tenant, route.branch, ["users.manage"]);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("rotate_join_code", { target_tenant_id: context.tenantId });
  if (error || typeof data !== "string") return errorState("Katılım kodu yenilenemedi. Bu işlem yalnızca işletme düzeyindeki yöneticiler içindir.");
  revalidatePath(`/app/${route.tenant}/${route.branch}/ayarlar/kullanicilar`);
  return { status: "success", message: "Yeni katılım kodu oluşturuldu. Eski kod artık çalışmaz.", joinCode: data };
}
