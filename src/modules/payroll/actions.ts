"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspacePermission } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CrudActionState } from "@/modules/settings/action-state";
import { periodRange } from "./calc";
import {
  attendanceInputSchema,
  parseAmountInput,
  parseDurationInput,
  payInputSchema,
  payrollEntryInputSchema,
  payrollErrorMessage,
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

const text = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
};

function refresh(route: { tenant: string; branch: string }) {
  revalidatePath(`/app/${route.tenant}/${route.branch}/personel/puantaj`);
}

export async function approveAttendanceAction(
  _state: CrudActionState,
  formData: FormData,
): Promise<CrudActionState> {
  const route = readRoute(formData);
  if (!route) return errorState("Çalışma alanı bilgisi eksik.");
  const context = await requireWorkspacePermission(route.tenant, route.branch, ["shifts.manage"]);

  const minutes = parseDurationInput(text(formData, "duration"));
  if (minutes === undefined) return errorState("Süreyi 7:30 ya da 7,5 gibi girin (en fazla 24 saat).");
  const values = attendanceInputSchema.safeParse({
    shiftId: text(formData, "shiftId"),
    status: text(formData, "status"),
    minutes,
    note: text(formData, "note"),
  });
  if (!values.success) return errorState("Puantaj bilgilerini kontrol edin.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("approve_shift_attendance", {
    target_tenant_id: context.tenantId,
    target_branch_id: context.branchId,
    target_shift_id: values.data.shiftId,
    target_status: values.data.status,
    target_minutes: values.data.minutes,
    target_note: values.data.note || null,
  });
  if (error) return errorState(payrollErrorMessage(error.message, "Puantaj kaydedilemedi."));

  refresh(route);
  return successState(values.data.status === "absent" ? "Gelmedi olarak kaydedildi." : "Çalışma onaylandı.");
}

export async function approveMonthAsPlannedAction(
  _state: CrudActionState,
  formData: FormData,
): Promise<CrudActionState> {
  const route = readRoute(formData);
  if (!route) return errorState("Çalışma alanı bilgisi eksik.");
  const context = await requireWorkspacePermission(route.tenant, route.branch, ["shifts.manage"]);
  const period = text(formData, "period");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return errorState("Dönem geçersiz.");
  const { first, last } = periodRange(period);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("approve_attendance_as_planned", {
    target_tenant_id: context.tenantId,
    target_branch_id: context.branchId,
    range_start: first,
    range_end: last,
  });
  if (error) return errorState(payrollErrorMessage(error.message, "Toplu onay yapılamadı."));

  refresh(route);
  const approved = data && typeof data === "object" && "approved" in data ? Number(data.approved) : 0;
  return successState(
    approved > 0
      ? `${approved} vardiya planlandığı gibi onaylandı.`
      : "Onay bekleyen, tamamlanmış vardiya yok.",
  );
}

export async function setStaffPayAction(
  _state: CrudActionState,
  formData: FormData,
): Promise<CrudActionState> {
  const route = readRoute(formData);
  if (!route) return errorState("Çalışma alanı bilgisi eksik.");
  const context = await requireWorkspacePermission(route.tenant, route.branch, ["payroll.manage"]);

  const amountMinor = parseAmountInput(text(formData, "amount"));
  if (amountMinor === null) return errorState("Tutarı 30000 veya 150,50 gibi girin.");
  const values = payInputSchema.safeParse({
    membershipId: text(formData, "membershipId"),
    payType: text(formData, "payType"),
    amountMinor,
  });
  if (!values.success) return errorState("Ücret bilgilerini kontrol edin.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_staff_pay", {
    target_tenant_id: context.tenantId,
    target_membership_id: values.data.membershipId,
    target_pay_type: values.data.payType,
    target_amount_minor: values.data.amountMinor,
  });
  if (error) return errorState(payrollErrorMessage(error.message, "Ücret kaydedilemedi."));

  refresh(route);
  return successState("Ücret kaydedildi.");
}

export async function addPayrollEntryAction(
  _state: CrudActionState,
  formData: FormData,
): Promise<CrudActionState> {
  const route = readRoute(formData);
  if (!route) return errorState("Çalışma alanı bilgisi eksik.");
  const context = await requireWorkspacePermission(route.tenant, route.branch, ["payroll.manage"]);

  const amountMinor = parseAmountInput(text(formData, "amount"));
  if (amountMinor === null || amountMinor < 1) return errorState("Tutarı 500 veya 250,75 gibi girin.");
  const values = payrollEntryInputSchema.safeParse({
    membershipId: text(formData, "membershipId"),
    period: text(formData, "period"),
    kind: text(formData, "kind"),
    amountMinor,
    note: text(formData, "note"),
  });
  if (!values.success) return errorState("Kayıt bilgilerini kontrol edin.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("add_payroll_entry", {
    target_tenant_id: context.tenantId,
    target_membership_id: values.data.membershipId,
    target_period: `${values.data.period}-01`,
    target_kind: values.data.kind,
    target_amount_minor: values.data.amountMinor,
    target_note: values.data.note || null,
  });
  if (error) return errorState(payrollErrorMessage(error.message, "Kayıt eklenemedi."));

  refresh(route);
  return successState("Kayıt eklendi.");
}

export async function deletePayrollEntryAction(
  _state: CrudActionState,
  formData: FormData,
): Promise<CrudActionState> {
  const route = readRoute(formData);
  if (!route) return errorState("Çalışma alanı bilgisi eksik.");
  const context = await requireWorkspacePermission(route.tenant, route.branch, ["payroll.manage"]);
  const entryId = text(formData, "entryId");
  if (!entryId) return errorState("Silinecek kayıt seçilmedi.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("delete_payroll_entry", {
    target_tenant_id: context.tenantId,
    target_entry_id: entryId,
  });
  if (error) return errorState(payrollErrorMessage(error.message, "Kayıt silinemedi."));

  refresh(route);
  return successState("Kayıt silindi.");
}
