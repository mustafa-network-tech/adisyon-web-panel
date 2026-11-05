import { z } from "zod";
import { parseMoneyInput } from "@/lib/money";
import { isPeriod } from "./calc";

const uuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

export const attendanceInputSchema = z
  .object({
    shiftId: uuid,
    status: z.enum(["worked", "absent"]),
    /** Hours:minutes as total minutes; empty means "as planned". */
    minutes: z.number().int().min(1).max(1440).nullable(),
    note: z.string().trim().max(200),
  })
  .refine((value) => value.status === "worked" || value.minutes === null);

export const payInputSchema = z.object({
  membershipId: uuid,
  payType: z.enum(["monthly", "hourly"]),
  amountMinor: z.number().int().min(0).max(100_000_000_000),
});

export const payrollEntryInputSchema = z.object({
  membershipId: uuid,
  period: z.string().refine(isPeriod),
  kind: z.enum(["bonus", "deduction", "advance"]),
  amountMinor: z.number().int().min(1).max(100_000_000_000),
  note: z.string().trim().max(200),
});

/** "7:30", "7,5" or "450" (minutes when above 24) -> minutes; "" -> null. */
export function parseDurationInput(value: string): number | null | undefined {
  const text = value.trim();
  if (!text) return null;
  const clock = /^(\d{1,2}):([0-5]\d)$/.exec(text);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const hours = Number(text.replace(",", "."));
  if (Number.isFinite(hours) && hours > 0 && hours <= 24) return Math.round(hours * 60);
  return undefined;
}

export function parseAmountInput(value: string) {
  return parseMoneyInput(value);
}

const errors: Record<string, string> = {
  attendance_denied: "Puantaj onaylama yetkiniz yok.",
  payroll_denied: "Maaş ve prim verilerini yönetme yetkiniz yok.",
  invalid_attendance: "Puantaj bilgilerini kontrol edin.",
  attendance_in_future: "Henüz gerçekleşmemiş bir vardiya onaylanamaz.",
  shift_not_found: "Vardiya bulunamadı.",
  invalid_payroll: "Tutar ve dönem bilgilerini kontrol edin.",
  membership_not_found: "Personel bulunamadı.",
  payroll_entry_not_found: "Kayıt bulunamadı.",
};

export function payrollErrorMessage(message: string | undefined, fallback: string) {
  const code = message ? Object.keys(errors).find((item) => message.includes(item)) : undefined;
  return code ? errors[code] : fallback;
}
