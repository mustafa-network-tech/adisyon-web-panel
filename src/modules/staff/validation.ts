import { z } from "zod";
import { isIsoDate } from "./dates";

const uuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const optionalUuid = z.union([z.literal(""), uuid]);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const optionalTime = z.union([z.literal(""), time]);
const isoDate = z.string().refine(isIsoDate);
const optionalDate = z.union([z.literal(""), isoDate]);

export const shiftInputSchema = z
  .object({
    id: optionalUuid,
    membershipId: uuid,
    date: isoDate,
    kind: z.enum(["work", "leave"]),
    startTime: optionalTime,
    endTime: optionalTime,
    templateId: optionalUuid,
    notes: z.string().trim().max(300),
  })
  .refine(
    (value) =>
      value.kind === "leave" ||
      (value.startTime !== "" && value.endTime !== "" && value.startTime !== value.endTime),
    { message: "work_shift_needs_distinct_times" },
  );

export const shiftTemplateInputSchema = z
  .object({
    id: optionalUuid,
    name: z.string().trim().min(2).max(60),
    startTime: time,
    endTime: time,
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    isActive: z.boolean(),
  })
  .refine((value) => value.startTime !== value.endTime);

export const staffProfileInputSchema = z
  .object({
    membershipId: uuid,
    positionTitle: z.string().trim().max(80),
    hiredOn: optionalDate,
    status: z.enum(["active", "on_leave", "terminated"]),
    terminatedOn: optionalDate,
    emergencyName: z.string().trim().max(120),
    emergencyPhone: z.string().trim().max(40),
    notes: z.string().trim().max(1000),
  })
  .refine((value) => (value.status === "terminated") === (value.terminatedOn !== ""), {
    message: "terminated_date_mismatch",
  })
  .refine((value) => !value.hiredOn || !value.terminatedOn || value.terminatedOn >= value.hiredOn, {
    message: "terminated_before_hired",
  });

export const staffErrorMessages: Record<string, string> = {
  shifts_manage_denied: "Vardiya planlama yetkiniz yok.",
  staff_manage_denied: "Personel kartlarını yalnızca şirket yöneticisi düzenleyebilir.",
  invalid_shift: "Vardiya bilgilerini kontrol edin (tarih en fazla 62 gün geriye, 400 gün ileriye olabilir).",
  membership_not_found: "Personel bulunamadı.",
  member_not_active: "Aktif olmayan personele vardiya yazılamaz.",
  member_not_in_branch: "Bu personel seçili şubede çalışmıyor.",
  shift_not_found: "Vardiya bulunamadı.",
  shift_overlap: "Bu personelin aynı saatlerde başka bir vardiyası var.",
  leave_conflicts_with_shift: "O gün için vardiya var; önce vardiyayı silin.",
  shift_conflicts_with_leave: "Personel o gün izinli; önce izni silin.",
  shift_template_not_found: "Vardiya şablonu bulunamadı.",
  shift_template_name_taken: "Bu isimde bir şablon zaten var.",
  invalid_shift_template: "Şablon bilgilerini kontrol edin.",
  invalid_staff_profile: "Personel kartı bilgilerini kontrol edin.",
  cannot_terminate_owner_or_self: "İşletme sahibi veya kendi kaydınız için işten ayrılış girilemez.",
};

export function staffErrorMessage(message: string | undefined, fallback: string) {
  if (!message) return fallback;
  const code = Object.keys(staffErrorMessages).find((item) => message.includes(item));
  return code ? staffErrorMessages[code] : fallback;
}
