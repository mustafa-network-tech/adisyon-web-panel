import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { todayInTurkey } from "@/modules/staff/dates";
import {
  isPeriod,
  periodRange,
  summarizeMember,
  type EntryKind,
  type MemberSummary,
  type PayShift,
  type PayType,
} from "./calc";

export type PayrollEntryView = {
  id: string;
  kind: EntryKind;
  amountMinor: number;
  note: string | null;
};

export type PayrollMember = {
  membershipId: string;
  fullName: string;
  positionTitle: string | null;
  employmentStatus: string;
  shifts: (PayShift & { note: string | null })[];
  entries: PayrollEntryView[];
  pay: { type: PayType; amountMinor: number } | null;
  summary: MemberSummary;
};

export type PayrollSnapshot = {
  period: string;
  today: string;
  canPayroll: boolean;
  canApprove: boolean;
  members: PayrollMember[];
};

type StaffRow = {
  membershipId: string;
  fullName: string;
  positionTitle: string | null;
  employmentStatus: string;
};

export function resolvePeriod(requested: string | undefined, today: string) {
  return requested && isPeriod(requested) ? requested : today.slice(0, 7);
}

export async function getPayrollSnapshot(input: {
  tenantId: string;
  branchId: string;
  period?: string;
  canPayroll: boolean;
  canApprove: boolean;
}): Promise<PayrollSnapshot> {
  const supabase = await createSupabaseServerClient();
  const today = todayInTurkey();
  const period = resolvePeriod(input.period, today);
  const { first, last } = periodRange(period);

  const [staffResult, shiftsResult, attendanceResult, payResult, entriesResult] = await Promise.all([
    supabase.rpc("list_branch_staff", {
      target_tenant_id: input.tenantId,
      target_branch_id: input.branchId,
    }),
    supabase
      .from("shifts")
      .select("id, membership_id, shift_date, start_time, end_time, notes")
      .eq("tenant_id", input.tenantId)
      .eq("branch_id", input.branchId)
      .eq("kind", "work")
      .gte("shift_date", first)
      .lte("shift_date", last)
      .order("shift_date")
      .order("start_time"),
    supabase
      .from("shift_attendance")
      .select("shift_id, status, approved_minutes")
      .eq("tenant_id", input.tenantId)
      .eq("branch_id", input.branchId)
      .gte("shift_date", first)
      .lte("shift_date", last),
    input.canPayroll
      ? supabase.from("staff_pay").select("membership_id, pay_type, amount_minor").eq("tenant_id", input.tenantId)
      : Promise.resolve({ data: [], error: null }),
    input.canPayroll
      ? supabase
          .from("payroll_entries")
          .select("id, membership_id, kind, amount_minor, note")
          .eq("tenant_id", input.tenantId)
          .eq("period", first)
          .order("created_at")
      : Promise.resolve({ data: [], error: null }),
  ]);

  const failed = [staffResult.error, shiftsResult.error, attendanceResult.error, payResult.error, entriesResult.error].find(Boolean);
  if (failed) throw new Error("Puantaj verileri okunamadı.");

  const attendanceByShift = new Map(
    (attendanceResult.data || []).map((row) => [
      row.shift_id as string,
      { status: row.status as "worked" | "absent", approvedMinutes: Number(row.approved_minutes) },
    ]),
  );
  const payByMember = new Map(
    (payResult.data || []).map((row) => [
      row.membership_id as string,
      { type: row.pay_type as PayType, amountMinor: Number(row.amount_minor) },
    ]),
  );

  const members: PayrollMember[] = ((staffResult.data || []) as StaffRow[])
    .map((staff) => {
      const shifts = (shiftsResult.data || [])
        .filter((row) => row.membership_id === staff.membershipId)
        .map((row) => ({
          id: row.id as string,
          date: row.shift_date as string,
          startTime: (row.start_time as string).slice(0, 5),
          endTime: (row.end_time as string).slice(0, 5),
          attendance: attendanceByShift.get(row.id as string) || null,
          note: (row.notes as string | null) ?? null,
        }));
      const entries: PayrollEntryView[] = (entriesResult.data || [])
        .filter((row) => row.membership_id === staff.membershipId)
        .map((row) => ({
          id: row.id as string,
          kind: row.kind as EntryKind,
          amountMinor: Number(row.amount_minor),
          note: (row.note as string | null) ?? null,
        }));
      const pay = input.canPayroll ? payByMember.get(staff.membershipId) || null : null;
      return {
        membershipId: staff.membershipId,
        fullName: staff.fullName,
        positionTitle: staff.positionTitle,
        employmentStatus: staff.employmentStatus,
        shifts,
        entries,
        pay,
        // Without a pay record the money columns stay empty, not zero.
        summary: summarizeMember({ today, shifts, entries, pay }),
      };
    })
    .filter((member) => member.shifts.length > 0 || member.employmentStatus !== "terminated");

  return { period, today, canPayroll: input.canPayroll, canApprove: input.canApprove, members };
}
