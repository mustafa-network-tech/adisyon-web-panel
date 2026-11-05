import { z } from "zod";
import { parseMoneyInput } from "@/lib/money";
import { readOnlyMessage, setupPendingMessage } from "@/modules/plan/usage";

export type DiscountKind = "percent" | "amount";

/** "10" or "12,5" -> basis points (1000 = 10%); undefined when invalid or not in 0.01–100. */
export function parsePercentInput(value: string): number | undefined {
  const text = value.trim().replace("%", "").replace(",", ".");
  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(text)) return undefined;
  const basisPoints = Math.round(Number(text) * 100);
  return basisPoints >= 1 && basisPoints <= 10_000 ? basisPoints : undefined;
}

/** Money text -> minor units; undefined when invalid or zero. */
export function parseDiscountAmount(value: string): number | undefined {
  const minor = parseMoneyInput(value);
  return minor && minor > 0 ? minor : undefined;
}

export function parseDiscountValue(kind: DiscountKind, value: string) {
  return kind === "percent" ? parsePercentInput(value) : parseDiscountAmount(value);
}

const postgresUuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

const routeSchema = z.object({
  tenant: z.string().trim().min(1).max(100),
  branch: z.string().trim().min(1).max(100),
  orderId: postgresUuid,
  expectedVersion: z.number().int().positive(),
});

const discountFields = {
  kind: z.enum(["percent", "amount", "none"]),
  /** Basis points for percent, minor units for amount, null for "none". */
  value: z.number().int().min(1).max(100_000_000_000).nullable(),
  reason: z.string().trim().max(200),
};

function consistent(value: { kind: string; value: number | null; reason: string }) {
  if (value.kind === "none") return value.value === null;
  if (value.value === null || value.reason.length < 3) return false;
  return value.kind !== "percent" || value.value <= 10_000;
}

export const orderDiscountInputSchema = routeSchema.extend(discountFields).refine(consistent);

export const itemDiscountInputSchema = routeSchema
  .extend({ orderItemId: postgresUuid, ...discountFields })
  .refine(consistent);

export function describeDiscount(type: DiscountKind | null, value: number) {
  if (!type) return "";
  return type === "percent" ? `%${(value / 100).toLocaleString("tr-TR", { maximumFractionDigits: 2 })}` : "tutar";
}

export const discountErrorMessages: Record<string, string> = {
  tenant_read_only: readOnlyMessage,
  tenant_setup_pending: setupPendingMessage,
  discount_denied: "İndirim uygulama yetkiniz yok.",
  invalid_discount: "İndirim bilgilerini kontrol edin (gerekçe en az 3 karakter, tutar adisyon toplamını aşamaz).",
  discount_after_item_payment: "Ürün bazlı ödeme alınmış bir kaleme/adisyona indirim uygulanamaz.",
  discount_below_paid: "İndirimli tutar, şimdiye kadar tahsil edilen tutarın altına düşemez.",
  order_not_editable: "Bu sipariş artık düzenlenemez.",
  order_item_not_editable: "Ürün bulunamadı.",
  order_version_conflict: "Sipariş başka bir cihazda değişti. Güncel veriler yükleniyor; işlemi yeniden deneyin.",
};

export function discountErrorMessage(message: string | undefined) {
  const code = message ? Object.keys(discountErrorMessages).find((item) => message.includes(item)) : undefined;
  return code ? discountErrorMessages[code] : "İndirim uygulanamadı.";
}
