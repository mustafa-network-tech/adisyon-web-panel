import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { addDays, isIsoDate, todayInTurkey, weekStartOf } from "./dates";
import type {
  EmploymentStatus,
  Shift,
  ShiftKind,
  ShiftTemplate,
  StaffMember,
  StaffSnapshot,
} from "./types";

type ShiftRow = {
  id: string;
  membership_id: string;
  branch_id: string;
  shift_date: string;
  kind: ShiftKind;
  start_time: string | null;
  end_time: string | null;
  template_id: string | null;
  notes: string | null;
};

type TemplateRow = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  color: string;
  is_active: boolean;
};

type StaffRow = {
  membershipId: string;
  userId: string;
  fullName: string;
  phone: string | null;
  status: StaffMember["status"];
  roleNames: string[];
  positionTitle: string | null;
  hiredOn: string | null;
  employmentStatus: EmploymentStatus;
  terminatedOn: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  notes: string | null;
};

const shiftColumns =
  "id, membership_id, branch_id, shift_date, kind, start_time, end_time, template_id, notes";

const hhmm = (value: string | null) => (value ? value.slice(0, 5) : null);

export function resolveWeekStart(requested: string | undefined, today: string) {
  return weekStartOf(requested && isIsoDate(requested) ? requested : today);
}

export async function getStaffSnapshot(input: {
  tenantId: string;
  branchId: string;
  userId: string;
  weekStart?: string;
  canPlan: boolean;
  canManageCards: boolean;
}): Promise<StaffSnapshot> {
  const supabase = await createSupabaseServerClient();
  const today = todayInTurkey();
  const weekStart = resolveWeekStart(input.weekStart, today);
  const planner = input.canPlan || input.canManageCards;

  const [ownMembership, branchesResult] = await Promise.all([
    supabase
      .from("tenant_memberships")
      .select("id")
      .eq("tenant_id", input.tenantId)
      .eq("user_id", input.userId)
      .maybeSingle(),
    supabase.from("branches").select("id, name").eq("tenant_id", input.tenantId),
  ]);
  if (ownMembership.error || branchesResult.error) {
    throw new Error("Personel verileri okunamadı.");
  }
  const branchNames = new Map(
    (branchesResult.data || []).map((item) => [item.id as string, item.name as string]),
  );
  const toShift = (row: ShiftRow): Shift => ({
    id: row.id,
    membershipId: row.membership_id,
    branchId: row.branch_id,
    branchName: branchNames.get(row.branch_id) || "Şube",
    date: row.shift_date,
    kind: row.kind,
    startTime: hhmm(row.start_time),
    endTime: hhmm(row.end_time),
    templateId: row.template_id,
    notes: row.notes,
  });

  const ownId = ownMembership.data?.id as string | undefined;
  const [myShiftsResult, templatesResult, staffResult, weekShiftsResult] = await Promise.all([
    ownId
      ? supabase
          .from("shifts")
          .select(shiftColumns)
          .eq("tenant_id", input.tenantId)
          .eq("membership_id", ownId)
          .gte("shift_date", today)
          .lte("shift_date", addDays(today, 28))
          .order("shift_date")
          .order("start_time")
      : Promise.resolve({ data: [], error: null }),
    planner
      ? supabase
          .from("shift_templates")
          .select("id, name, start_time, end_time, color, is_active")
          .eq("tenant_id", input.tenantId)
          .eq("branch_id", input.branchId)
          .order("start_time")
      : Promise.resolve({ data: [], error: null }),
    planner
      ? supabase.rpc("list_branch_staff", {
          target_tenant_id: input.tenantId,
          target_branch_id: input.branchId,
        })
      : Promise.resolve({ data: [], error: null }),
    input.canPlan
      ? supabase
          .from("shifts")
          .select(shiftColumns)
          .eq("tenant_id", input.tenantId)
          .eq("branch_id", input.branchId)
          .gte("shift_date", weekStart)
          .lte("shift_date", addDays(weekStart, 6))
          .order("shift_date")
          .order("start_time")
      : Promise.resolve({ data: [], error: null }),
  ]);

  const failed = [myShiftsResult.error, templatesResult.error, staffResult.error, weekShiftsResult.error].find(Boolean);
  if (failed) throw new Error("Personel ve vardiya verileri okunamadı.");

  const templates: ShiftTemplate[] = ((templatesResult.data || []) as TemplateRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    startTime: row.start_time.slice(0, 5),
    endTime: row.end_time.slice(0, 5),
    color: row.color,
    isActive: row.is_active,
  }));

  return {
    weekStart,
    today,
    canPlan: input.canPlan,
    canManageCards: input.canManageCards,
    myShifts: ((myShiftsResult.data || []) as ShiftRow[]).map(toShift),
    templates,
    members: ((staffResult.data || []) as StaffRow[]).map((row) => ({ ...row })),
    weekShifts: ((weekShiftsResult.data || []) as ShiftRow[]).map(toShift),
  };
}
