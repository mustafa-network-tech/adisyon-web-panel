"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SettingsActionState } from "@/modules/settings/management-types";
import { assignMemberSchema, subscriptionSchema } from "@/modules/settings/validation";

const errorState = (message: string): SettingsActionState => ({ status: "error", message });
const successState = (message: string): SettingsActionState => ({ status: "success", message });

export async function updateSubscriptionAction(
  _state: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  await requirePlatformAdmin();
  const values = subscriptionSchema.safeParse({
    tenantId: formData.get("tenantId"), planCode: formData.get("planCode"),
    status: formData.get("status"), startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt") || "", notes: formData.get("notes") || "",
    userLimit: formData.get("userLimit"), branchLimit: formData.get("branchLimit"),
    tableLimit: formData.get("tableLimit") ?? "", stationLimit: formData.get("stationLimit") ?? "",
  });
  if (!values.success) return errorState("Abonelik alanlarını ve tarih sırasını kontrol edin.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_tenant_subscription", {
    target_tenant_id: values.data.tenantId, target_plan_code: values.data.planCode,
    target_status: values.data.status, target_starts_at: new Date(values.data.startsAt).toISOString(),
    target_ends_at: values.data.endsAt ? new Date(values.data.endsAt).toISOString() : null,
    target_notes: values.data.notes,
    target_user_limit: values.data.userLimit, target_branch_limit: values.data.branchLimit,
    target_table_limit: values.data.tableLimit, target_station_limit: values.data.stationLimit,
  });
  if (error) return errorState("Abonelik güncellenemedi. Platform yetkisini ve tarihleri kontrol edin.");
  revalidatePath("/mk-admin");
  return successState("Yeni abonelik kaydı eklendi ve tenant erişim durumu güncellendi.");
}

export async function assignMemberAction(
  _state: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  await requirePlatformAdmin();
  const values = assignMemberSchema.safeParse({
    userId: formData.get("userId"),
    tenantId: formData.get("tenantId"),
    roleCode: formData.get("roleCode"),
  });
  if (!values.success) return errorState("İşletme ve rol seçin.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("platform_assign_member", {
    target_user_id: values.data.userId,
    target_tenant_id: values.data.tenantId,
    target_role_code: values.data.roleCode,
  });
  if (error) {
    return errorState(
      error.message.includes("user_limit_reached")
        ? "Bu işletmenin kullanıcı limiti dolu. Önce limiti artırın."
        : "Üye atanamadı.",
    );
  }
  revalidatePath("/mk-admin");
  return successState("Üye işletmeye atandı.");
}
