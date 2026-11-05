"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspacePermission } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPlanUsage } from "@/modules/plan/repository";
import { stationErrorMessage, stationInputSchema } from "./validation";

export async function saveKitchenStationAction(input: unknown): Promise<{ ok: boolean; message: string }> {
  const values = stationInputSchema.safeParse(input);
  if (!values.success) return { ok: false, message: stationErrorMessage("invalid_station") };
  const context = await requireWorkspacePermission(values.data.tenant, values.data.branch, ["catalog.manage"]);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_kitchen_station", {
    target_tenant_id: context.tenantId,
    target_branch_id: context.branchId,
    target_station_id: values.data.stationId || null,
    target_name: values.data.name,
    target_color: values.data.color,
    target_is_active: values.data.isActive,
    target_product_ids: values.data.productIds,
  });
  if (error) {
    const limit = error.message.includes("station_limit_reached")
      ? (await getPlanUsage(context.tenantId, context.branchId))?.stationLimit ?? null
      : null;
    return { ok: false, message: stationErrorMessage(error.message, limit) };
  }

  const { tenant, branch } = values.data;
  revalidatePath(`/app/${tenant}/${branch}/ayarlar/istasyonlar`);
  revalidatePath(`/app/${tenant}/${branch}/ayarlar/menu`);
  revalidatePath(`/app/${tenant}/${branch}/mutfak`);
  return { ok: true, message: "İstasyon kaydedildi." };
}
