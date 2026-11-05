import { describe, expect, it } from "vitest";
import {
  attendanceInputSchema,
  parseAmountInput,
  parseDurationInput,
  payrollEntryInputSchema,
  payrollErrorMessage,
} from "./validation";

const id = "10000000-0000-4000-8000-000000000001";

describe("duration input", () => {
  it("reads clock and decimal hours", () => {
    expect(parseDurationInput("7:30")).toBe(450);
    expect(parseDurationInput("7,5")).toBe(450);
    expect(parseDurationInput("8")).toBe(480);
    expect(parseDurationInput("  ")).toBeNull();
  });

  it("rejects nonsense", () => {
    expect(parseDurationInput("abc")).toBeUndefined();
    expect(parseDurationInput("25")).toBeUndefined();
    expect(parseDurationInput("7:75")).toBeUndefined();
    expect(parseDurationInput("-2")).toBeUndefined();
  });
});

describe("payroll validation", () => {
  it("does not allow minutes on an absence", () => {
    expect(attendanceInputSchema.safeParse({ shiftId: id, status: "absent", minutes: null, note: "" }).success).toBe(true);
    expect(attendanceInputSchema.safeParse({ shiftId: id, status: "absent", minutes: 60, note: "" }).success).toBe(false);
    expect(attendanceInputSchema.safeParse({ shiftId: id, status: "worked", minutes: 450, note: "" }).success).toBe(true);
  });

  it("accepts an optional bonus entry but not zero or a bad period", () => {
    const base = { membershipId: id, period: "2026-11", kind: "bonus", amountMinor: 50000, note: "" };
    expect(payrollEntryInputSchema.safeParse(base).success).toBe(true);
    expect(payrollEntryInputSchema.safeParse({ ...base, amountMinor: 0 }).success).toBe(false);
    expect(payrollEntryInputSchema.safeParse({ ...base, period: "2026-13" }).success).toBe(false);
    expect(payrollEntryInputSchema.safeParse({ ...base, kind: "tip" }).success).toBe(false);
  });

  it("parses Turkish money and maps errors", () => {
    expect(parseAmountInput("30.000,50")).toBe(3000050);
    expect(parseAmountInput("abc")).toBeNull();
    expect(payrollErrorMessage("payroll_denied", "x")).toMatch(/yetkiniz yok/);
    expect(payrollErrorMessage("boom", "yedek")).toBe("yedek");
  });
});
