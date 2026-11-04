"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requirePlatformAdmin } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SettingsActionState } from "@/modules/settings/management-types";
import { provisionTenantSchema, subscriptionSchema } from "@/modules/settings/validation";

const errorState = (message: string): SettingsActionState => ({ status: "error", message });
const successState = (message: string, invitationUrl?: string): SettingsActionState => ({ status: "success", message, invitationUrl });

export async function provisionTenantAction(
  _state: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  await requirePlatformAdmin();
  const values = provisionTenantSchema.safeParse({
    name: formData.get("name"), legalName: formData.get("legalName") || "",
    slug: formData.get("slug"), branchName: formData.get("branchName"),
    branchSlug: formData.get("branchSlug"), ownerEmail: formData.get("ownerEmail"),
    planCode: formData.get("planCode"),
    status: formData.get("status"), endsAt: formData.get("endsAt") || "",
    notes: formData.get("notes") || "",
  });
  if (!values.success) return errorState("Yeni işletme alanlarını kontrol edin.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("provision_tenant", {
    target_name: values.data.name, target_legal_name: values.data.legalName,
    target_slug: values.data.slug, target_branch_name: values.data.branchName,
    target_branch_slug: values.data.branchSlug, target_owner_email: values.data.ownerEmail,
    target_plan_code: values.data.planCode,
    target_subscription_status: values.data.status,
    target_ends_at: values.data.endsAt ? new Date(values.data.endsAt).toISOString() : null,
    target_notes: values.data.notes,
  });
  if (error || !data || typeof data !== "object" || !("ownerInvitationToken" in data)) return errorState("İşletme oluşturulamadı. Slug benzersiz olmalı ve tarihler geçerli olmalıdır.");
  revalidatePath("/mk-admin");
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") || headerStore.get("host");
  const protocol = headerStore.get("x-forwarded-proto") || "https";
  const path = `/davet/${String(data.ownerInvitationToken)}`;
  return successState("İşletme oluşturuldu. İlk sahip davetini güvenli biçimde paylaşın.", host ? `${protocol}://${host}${path}` : path);
}

export async function updateSubscriptionAction(
  _state: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  await requirePlatformAdmin();
  const values = subscriptionSchema.safeParse({
    tenantId: formData.get("tenantId"), planCode: formData.get("planCode"),
    status: formData.get("status"), startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt") || "", notes: formData.get("notes") || "",
  });
  if (!values.success) return errorState("Abonelik alanlarını ve tarih sırasını kontrol edin.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_tenant_subscription", {
    target_tenant_id: values.data.tenantId, target_plan_code: values.data.planCode,
    target_status: values.data.status, target_starts_at: new Date(values.data.startsAt).toISOString(),
    target_ends_at: values.data.endsAt ? new Date(values.data.endsAt).toISOString() : null,
    target_notes: values.data.notes,
  });
  if (error) return errorState("Abonelik güncellenemedi. Platform yetkisini ve tarihleri kontrol edin.");
  revalidatePath("/mk-admin");
  return successState("Yeni abonelik kaydı eklendi ve tenant erişim durumu güncellendi.");
}
