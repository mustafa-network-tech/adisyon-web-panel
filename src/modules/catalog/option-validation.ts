import { z } from "zod";

const uuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

export const optionChoiceInputSchema = z.object({
  id: z.union([z.literal(""), uuid]),
  name: z.string().trim().min(1).max(60),
  priceDeltaMinor: z.number().int().min(-100_000_000).max(100_000_000),
  isActive: z.boolean(),
});

export const optionGroupInputSchema = z
  .object({
    tenant: z.string().trim().min(1).max(100),
    branch: z.string().trim().min(1).max(100),
    groupId: z.union([z.literal(""), uuid]),
    name: z.string().trim().min(2).max(60),
    kind: z.enum(["variant", "extra", "removal"]),
    required: z.boolean(),
    /** null = no limit (extras and removals only). */
    maxSelect: z.number().int().min(1).max(30).nullable(),
    isActive: z.boolean(),
    choices: z.array(optionChoiceInputSchema).min(1).max(40),
    productIds: z.array(uuid).max(1000),
  })
  .superRefine((value, context) => {
    const names = value.choices.map((choice) => choice.name.toLocaleLowerCase("tr-TR"));
    if (new Set(names).size !== names.length) {
      context.addIssue({ code: "custom", message: "duplicate_choice_name" });
    }
    if (value.kind === "removal" && value.choices.some((choice) => choice.priceDeltaMinor !== 0)) {
      context.addIssue({ code: "custom", message: "removal_must_be_free" });
    }
    if (value.kind === "extra" && value.choices.some((choice) => choice.priceDeltaMinor < 0)) {
      context.addIssue({ code: "custom", message: "extra_cannot_discount" });
    }
    if (value.maxSelect !== null && value.required && value.maxSelect < 1) {
      context.addIssue({ code: "custom", message: "invalid_limit" });
    }
  });

export const optionErrorMessages: Record<string, string> = {
  catalog_manage_denied: "Menü yönetimi yetkiniz yok.",
  availability_denied: "Ürün durumu değiştirme yetkiniz yok.",
  removal_must_be_free: "Çıkarılacak malzemeler ücretsiz olmalıdır.",
  extra_cannot_discount: "Ekstra seçenekler fiyatı düşüremez; indirim için porsiyon grubunu kullanın.",
  invalid_option_group: "Grup bilgilerini kontrol edin (en az bir seçenek gerekir).",
  option_group_not_found: "Seçenek grubu bulunamadı.",
  option_name_taken: "Bu isimde bir seçenek grubu zaten var.",
  option_not_found: "Seçenek bulunamadı.",
};

export function optionErrorMessage(message: string | undefined, fallback: string) {
  const code = message ? Object.keys(optionErrorMessages).find((item) => message.includes(item)) : undefined;
  return code ? optionErrorMessages[code] : fallback;
}
