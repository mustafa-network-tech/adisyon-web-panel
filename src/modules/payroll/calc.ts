export type PayType = "monthly" | "hourly";
export type EntryKind = "bonus" | "deduction" | "advance";

export type PayShift = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  attendance: { status: "worked" | "absent"; approvedMinutes: number } | null;
};

export type PayEntry = { kind: EntryKind; amountMinor: number };

export type MemberSummary = {
  plannedShifts: number;
  plannedMinutes: number;
  approvedShifts: number;
  approvedMinutes: number;
  absentShifts: number;
  /** Finished or ongoing shifts that still need a manager's approval. */
  pendingShifts: number;
  grossMinor: number | null;
  bonusMinor: number;
  deductionMinor: number;
  advanceMinor: number;
  netMinor: number | null;
};

export function plannedShiftMinutes(startTime: string, endTime: string) {
  const toMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  return (toMinutes(endTime) - toMinutes(startTime) + 1440) % 1440;
}

/** "2026-11" -> first and last day of that month. */
export function periodRange(period: string) {
  const [year, month] = period.split("-").map(Number);
  const first = `${period}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { first, last: `${period}-${String(lastDay).padStart(2, "0")}` };
}

export function isPeriod(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function shiftPeriod(period: string, delta: number) {
  const [year, month] = period.split("-").map(Number);
  const moved = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${moved.getUTCFullYear()}-${String(moved.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Month summary for one person. Monthly pay is a fixed amount (absences are
 * handled by the manager with a deduction line); hourly pay follows the
 * approved minutes. `pay` is null when the viewer may not see pay data.
 */
export function summarizeMember(input: {
  today: string;
  shifts: PayShift[];
  entries: PayEntry[];
  pay: { type: PayType; amountMinor: number } | null;
}): MemberSummary {
  let plannedMinutes = 0;
  let approvedMinutes = 0;
  let approvedShifts = 0;
  let absentShifts = 0;
  let pendingShifts = 0;

  for (const shift of input.shifts) {
    plannedMinutes += plannedShiftMinutes(shift.startTime, shift.endTime);
    if (shift.attendance?.status === "worked") {
      approvedShifts += 1;
      approvedMinutes += shift.attendance.approvedMinutes;
    } else if (shift.attendance?.status === "absent") {
      absentShifts += 1;
    } else if (shift.date <= input.today) {
      pendingShifts += 1;
    }
  }

  const sum = (kind: EntryKind) =>
    input.entries.filter((entry) => entry.kind === kind).reduce((total, entry) => total + entry.amountMinor, 0);
  const bonusMinor = sum("bonus");
  const deductionMinor = sum("deduction");
  const advanceMinor = sum("advance");

  let grossMinor: number | null = null;
  if (input.pay) {
    grossMinor =
      input.pay.type === "monthly"
        ? input.pay.amountMinor
        : Math.round((approvedMinutes * input.pay.amountMinor) / 60);
  }

  return {
    plannedShifts: input.shifts.length,
    plannedMinutes,
    approvedShifts,
    approvedMinutes,
    absentShifts,
    pendingShifts,
    grossMinor,
    bonusMinor,
    deductionMinor,
    advanceMinor,
    netMinor: grossMinor === null ? null : grossMinor + bonusMinor - deductionMinor - advanceMinor,
  };
}
