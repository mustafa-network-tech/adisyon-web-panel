import { z } from "zod";

const postgresUuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

export type VoidMode = "void" | "comp";

export const voidItemInputSchema = z.object({
  tenant: z.string().trim().min(1).max(100),
  branch: z.string().trim().min(1).max(100),
  orderId: postgresUuid,
  orderItemId: postgresUuid,
  expectedVersion: z.number().int().positive(),
  quantity: z.number().int().min(1).max(99),
  mode: z.enum(["void", "comp"]),
  reason: z.string().trim().min(3).max(200),
});

export const voidErrorMessages: Record<string, string> = {
  void_denied: "Gönderilmiş ürünü iptal/ikram etme yetkiniz yok.",
  invalid_void: "Adet ve gerekçe girin (gerekçe en az 3 karakter).",
  void_exceeds_sent: "Mutfağa gönderilenden fazlası iptal edilemez. Gönderilmemiş adetler için normal düzenlemeyi kullanın.",
  void_item_paid: "Ödemesi alınmış adetler iptal edilemez. Önce iade yapın.",
  void_below_paid: "İptalden sonra adisyon tutarı tahsil edilen tutarın altına düşemez. Önce iade yapın.",
  already_free: "Bu ürün zaten ücretsiz.",
  order_not_editable: "Bu sipariş artık düzenlenemez.",
  order_item_not_editable: "Ürün bulunamadı.",
  order_version_conflict: "Sipariş başka bir cihazda değişti. Güncel veriler yükleniyor; işlemi yeniden deneyin.",
};

export function voidErrorMessage(message: string | undefined) {
  const code = message ? Object.keys(voidErrorMessages).find((item) => message.includes(item)) : undefined;
  return code ? voidErrorMessages[code] : "İşlem tamamlanamadı.";
}

/** Short sentence for the alert managers and the kitchen see. */
export function describeVoid(input: {
  mode: VoidMode;
  quantity: number;
  productName: string;
  reason: string;
  actorName: string | null;
}) {
  const verb = input.mode === "void" ? "iptal etti" : "ikram etti";
  return `${input.actorName || "Bir çalışan"} ${input.quantity}× ${input.productName} ${verb} (${input.reason})`;
}
