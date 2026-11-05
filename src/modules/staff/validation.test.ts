import { describe, expect, it } from "vitest";
import { addDays, shiftMinutes, todayInTurkey, weekDays, weekStartOf } from "./dates";
import { shiftInputSchema, staffErrorMessage, staffProfileInputSchema } from "./validation";

const id = "10000000-0000-4000-8000-000000000001";

describe("week helpers", () => {
  it("starts weeks on Monday", () => {
    expect(weekStartOf("2026-11-05")).toBe("2026-11-02"); // Thursday
    expect(weekStartOf("2026-11-08")).toBe("2026-11-02"); // Sunday
    expect(weekStartOf("2026-11-02")).toBe("2026-11-02");
    expect(weekDays("2026-11-02")).toHaveLength(7);
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });

  it("uses the Turkish calendar day around midnight UTC", () => {
    expect(todayInTurkey(new Date("2026-11-05T21:30:00Z"))).toBe("2026-11-06");
  });

  it("computes overnight shift lengths", () => {
    expect(shiftMinutes("09:00", "17:30")).toBe(510);
    expect(shiftMinutes("22:00", "06:00")).toBe(480);
  });
});

describe("shift validation", () => {
  const base = {
    id: "",
    membershipId: id,
    date: "2026-11-05",
    kind: "work",
    startTime: "09:00",
    endTime: "17:00",
    templateId: "",
    notes: "",
  };

  it("accepts a work shift and a leave without times", () => {
    expect(shiftInputSchema.safeParse(base).success).toBe(true);
    expect(shiftInputSchema.safeParse({ ...base, kind: "leave", startTime: "", endTime: "" }).success).toBe(true);
  });

  it("rejects work shifts without distinct times and invalid dates", () => {
    expect(shiftInputSchema.safeParse({ ...base, endTime: "09:00" }).success).toBe(false);
    expect(shiftInputSchema.safeParse({ ...base, startTime: "" }).success).toBe(false);
    expect(shiftInputSchema.safeParse({ ...base, date: "2026-02-31" }).success).toBe(false);
    expect(shiftInputSchema.safeParse({ ...base, startTime: "25:00" }).success).toBe(false);
  });
});

describe("staff card validation", () => {
  const base = {
    membershipId: id,
    positionTitle: "Garson",
    hiredOn: "2026-01-10",
    status: "active",
    terminatedOn: "",
    emergencyName: "",
    emergencyPhone: "",
    notes: "",
  };

  it("requires a leaving date exactly when terminated", () => {
    expect(staffProfileInputSchema.safeParse(base).success).toBe(true);
    expect(staffProfileInputSchema.safeParse({ ...base, status: "terminated" }).success).toBe(false);
    expect(staffProfileInputSchema.safeParse({ ...base, status: "terminated", terminatedOn: "2026-03-01" }).success).toBe(true);
    expect(staffProfileInputSchema.safeParse({ ...base, terminatedOn: "2026-03-01" }).success).toBe(false);
    expect(staffProfileInputSchema.safeParse({ ...base, status: "terminated", terminatedOn: "2025-12-31" }).success).toBe(false);
  });

  it("maps database errors to readable messages", () => {
    expect(staffErrorMessage("shift_overlap", "x")).toMatch(/aynı saatlerde/);
    expect(staffErrorMessage("boom", "yedek")).toBe("yedek");
  });
});
