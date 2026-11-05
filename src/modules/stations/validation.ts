import { z } from "zod";
import { limitReachedMessage, readOnlyMessage } from "@/modules/plan/usage";

const uuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

export const stationInputSchema = z.object({
  tenant: z.string().trim().min(1).max(100),
  branch: z.string().trim().min(1).max(100),
  stationId: z.union([z.literal(""), uuid]),
  name: z.string().trim().min(2).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  isActive: z.boolean(),
  productIds: z.array(uuid).max(2000),
});

export const stationColors = ["#e8623a", "#285e9f", "#23866b", "#e3a53b", "#8a3ffc", "#b63b32"] as const;

/** Names offered as one-tap starters; the business can type anything. */
export const stationSuggestions = ["Mutfak", "Izgara", "Fırın", "Bar", "Soğuk", "Tatlı"] as const;

const messages: Record<string, string> = {
  tenant_read_only: readOnlyMessage,
  catalog_manage_denied: "Menü yönetimi yetkiniz yok.",
  invalid_station: "İstasyon adı (2–40 karakter), rengi ve ürün seçimini kontrol edin.",
  station_not_found: "İstasyon bulunamadı.",
  station_name_taken: "Bu şubede aynı isimde bir istasyon zaten var.",
  last_station: "Şubede en az bir aktif istasyon kalmalıdır; sipariş fişleri bu istasyonlara düşer.",
};

export function stationErrorMessage(message: string | undefined, stationLimit: number | null = null) {
  if (message?.includes("station_limit_reached")) return limitReachedMessage("station", stationLimit);
  const code = message ? Object.keys(messages).find((item) => message.includes(item)) : undefined;
  return code ? messages[code] : "İstasyon kaydedilemedi.";
}
