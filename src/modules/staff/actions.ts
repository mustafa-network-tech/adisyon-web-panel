"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspacePermission } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CrudActionState } from "@/modules/settings/action-state";
import {
  shiftInputSchema,
  shiftTemplateInputSchema,
  staffErrorMessage,
  staffProfileInputSchema,
} from "./validation";

function errorState(message: string): CrudActionState {
  return { status: "error", message };
}

function successState(message: string): CrudActionState {
  return { status: "success", message };
}

function readRoute(formData: FormData) {
  const tenant = formData.get("tenant");
  const branch = formData.get("branch");
  return typeof tenant === "string" && typeof branch === "string" ? { tenant, branch } : null;
}

function refresh(route: { tenant: string; branch: string }) {
  revalidatePath(`/app/${route.tenant}/${route.branch}/personel`);
}

const text = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
};

export async function saveShiftAction(
  _state: CrudActionState,
  formData: FormData,
): Promise<CrudActionState> {
  const route = readRoute(formData);
  if (!route) return errorState("Çalışma alanı bilgisi eksik.");
  const context = await requireWorkspacePermission(route.tenant, route.branch, ["shifts.manage"]);

  const values = shiftInputSchema.safeParse({
    id: text(formData, "id"),
    membershipId: text(formData, "membershipId"),
    date: text(formData, "date"),
    kind: text(formData, "kind"),
    startTime: text(formData, "startTime"),
    endTime: text(formData, "endTime"),
    templateId: text(formData, "templateId"),
    notes: text(formData, "notes"),
  });
  if (!values.success) return errorState("Personel, tarih ve (vardiya ise) farklı başlangıç/bitiş saati girin.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_shift", {
    target_tenant_id: context.tenantId,
    target_branch_id: context.branchId,
    target_shift_id: values.data.id || null,
    target_membership_id: values.data.membershipId,
    target_date: values.data.date,
    target_kind: values.data.kind,
    target_start: values.data.kind === "work" ? values.data.startTime : null,
    target_end: values.data.kind === "work" ? values.data.endTime : null,
    target_notes: values.data.notes || null,
    target_template_id: values.data.templateId || null,
  });
  if (error) return errorState(staffErrorMessage(error.message, "Vardiya kaydedilemedi."));

  refresh(route);
  return successState(values.data.id ? "Kayıt güncellendi." : "Kayıt eklendi.");
}

export async function deleteShiftAction(
  _state: CrudActionState,
  formData: FormData,
): Promise<CrudActionState> {
  const route = readRoute(formData);
  if (!route) return errorState("Çalışma alanı bilgisi eksik.");
  const context = await requireWorkspacePermission(route.tenant, route.branch, ["shifts.manage"]);
  const shiftId = text(formData, "id");
  if (!shiftId) return errorState("Silinecek kayıt seçilmedi.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("delete_shift", {
    target_tenant_id: context.tenantId,
    target_branch_id: context.branchId,
    target_shift_id: shiftId,
  });
  if (error) return errorState(staffErrorMessage(error.message, "Kayıt silinemedi."));

  refresh(route);
  return successState("Kayıt silindi.");
}

export async function saveShiftTemplateAction(
  _state: CrudActionState,
  formData: FormData,
): Promise<CrudActionState> {
  const route = readRoute(formData);
  if (!route) return errorState("Çalışma alanı bilgisi eksik.");
  const context = await requireWorkspacePermission(route.tenant, route.branch, ["shifts.manage"]);

  const values = shiftTemplateInputSchema.safeParse({
    id: text(formData, "id"),
    name: text(formData, "name"),
    startTime: text(formData, "startTime"),
    endTime: text(formData, "endTime"),
    color: text(formData, "color") || "#e8623a",
    isActive: text(formData, "isActive") !== "false",
  });
  if (!values.success) return errorState("Şablon adı ve farklı başlangıç/bitiş saati girin.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_shift_template", {
    target_tenant_id: context.tenantId,
    target_branch_id: context.branchId,
    target_template_id: values.data.id || null,
    target_name: values.data.name,
    target_start: values.data.startTime,
    target_end: values.data.endTime,
    target_color: values.data.color,
    target_is_active: values.data.isActive,
  });
  if (error) return errorState(staffErrorMessage(error.message, "Şablon kaydedilemedi."));

  refresh(route);
  return successState("Şablon kaydedildi.");
}

export async function saveStaffProfileAction(
  _state: CrudActionState,
  formData: FormData,
): Promise<CrudActionState> {
  const route = readRoute(formData);
  if (!route) return errorState("Çalışma alanı bilgisi eksik.");
  const context = await requireWorkspacePermission(route.tenant, route.branch, ["staff.manage"]);

  const values = staffProfileInputSchema.safeParse({
    membershipId: text(formData, "membershipId"),
    positionTitle: text(formData, "positionTitle"),
    hiredOn: text(formData, "hiredOn"),
    status: text(formData, "status"),
    terminatedOn: text(formData, "terminatedOn"),
    emergencyName: text(formData, "emergencyName"),
    emergencyPhone: text(formData, "emergencyPhone"),
    notes: text(formData, "notes"),
  });
  if (!values.success) {
    return errorState("Kart bilgilerini kontrol edin. İşten ayrılış tarihi yalnızca 'İşten ayrıldı' durumunda ve işe giriş tarihinden sonra girilir.");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("save_staff_profile", {
    target_tenant_id: context.tenantId,
    target_membership_id: values.data.membershipId,
    target_position: values.data.positionTitle || null,
    target_hired_on: values.data.hiredOn || null,
    target_status: values.data.status,
    target_terminated_on: values.data.terminatedOn || null,
    target_emergency_name: values.data.emergencyName || null,
    target_emergency_phone: values.data.emergencyPhone || null,
    target_notes: values.data.notes || null,
  });
  if (error) return errorState(staffErrorMessage(error.message, "Personel kartı kaydedilemedi."));

  refresh(route);
  const suspended = Boolean(data && typeof data === "object" && "accessSuspended" in data && data.accessSuspended);
  return successState(
    suspended
      ? "Kart kaydedildi. Personelin sisteme erişimi askıya alındı."
      : "Personel kartı kaydedildi.",
  );
}
