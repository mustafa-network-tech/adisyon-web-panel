import { describe, expect, it } from "vitest";
import { isPeriod, periodRange, shiftPeriod, summarizeMember, type PayShift } from "./calc";

const shift = (id: string, date: string, start: string, end: string, attendance: PayShift["attendance"]): PayShift => ({
  id,
  date,
  startTime: start,
  endTime: end,
  attendance,
});

describe("period helpers", () => {
  it("validates and moves months", () => {
    expect(isPeriod("2026-11")).toBe(true);
    expect(isPeriod("2026-13")).toBe(false);
    expect(isPeriod("2026-1")).toBe(false);
    expect(shiftPeriod("2026-12", 1)).toBe("2027-01");
    expect(shiftPeriod("2026-01", -1)).toBe("2025-12");
  });

  it("knows month ends including leap years", () => {
    expect(periodRange("2026-11")).toEqual({ first: "2026-11-01", last: "2026-11-30" });
    expect(periodRange("2028-02").last).toBe("2028-02-29");
  });
});

describe("member summary", () => {
  const shifts = [
    shift("a", "2026-11-02", "09:00", "17:00", { status: "worked", approvedMinutes: 480 }),
    shift("b", "2026-11-03", "22:00", "06:00", { status: "worked", approvedMinutes: 450 }),
    shift("c", "2026-11-04", "09:00", "17:00", { status: "absent", approvedMinutes: 0 }),
    shift("d", "2026-11-05", "09:00", "17:00", null), // today, not approved yet
    shift("e", "2026-11-10", "09:00", "17:00", null), // future
  ];

  it("counts planned, approved, absent and pending shifts", () => {
    const summary = summarizeMember({ today: "2026-11-05", shifts, entries: [], pay: null });
    expect(summary.plannedShifts).toBe(5);
    expect(summary.plannedMinutes).toBe(5 * 480);
    expect(summary.approvedShifts).toBe(2);
    expect(summary.approvedMinutes).toBe(930);
    expect(summary.absentShifts).toBe(1);
    expect(summary.pendingShifts).toBe(1);
    expect(summary.grossMinor).toBeNull();
    expect(summary.netMinor).toBeNull();
  });

  it("pays a fixed amount monthly and adds the optional bonus manually", () => {
    const summary = summarizeMember({
      today: "2026-11-05",
      shifts,
      entries: [
        { kind: "bonus", amountMinor: 50000 },
        { kind: "deduction", amountMinor: 20000 },
        { kind: "advance", amountMinor: 100000 },
      ],
      pay: { type: "monthly", amountMinor: 3000000 },
    });
    expect(summary.grossMinor).toBe(3000000);
    expect(summary.netMinor).toBe(3000000 + 50000 - 20000 - 100000);
  });

  it("pays hourly pay from approved minutes only", () => {
    const summary = summarizeMember({
      today: "2026-11-05",
      shifts,
      entries: [],
      pay: { type: "hourly", amountMinor: 15000 }, // 150 TL / hour
    });
    // 930 minutes = 15.5 hours
    expect(summary.grossMinor).toBe(232500);
    expect(summary.netMinor).toBe(232500);
  });

  it("works without a bonus", () => {
    const summary = summarizeMember({ today: "2026-11-05", shifts: [], entries: [], pay: { type: "monthly", amountMinor: 100 } });
    expect(summary.bonusMinor).toBe(0);
    expect(summary.netMinor).toBe(100);
  });
});
