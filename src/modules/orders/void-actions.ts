"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspacePermission } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { OrderActionResult } from "./types";
import { voidErrorMessage, voidItemInputSchema } from "./void";

/** Cancel or comp units that already went to the kitchen. Always with a written reason. */
export async function voidOrderItemAction(input: unknown): Promise<OrderActionResult & { orderCancelled?: boolean }> {
  const values = voidItemInputSchema.safeParse(input);
  if (!values.success) {
    return { ok: false, code: "invalid_input", message: "Adet ve gerekçe girin (gerekçe en az 3 karakter)." };
  }
  const context = await requireWorkspacePermission(values.data.tenant, values.data.branch, ["orders.cancel"]);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("void_order_item", {
    target_tenant_id: context.tenantId,
    target_branch_id: context.branchId,
    target_order_id: values.data.orderId,
    target_order_item_id: values.data.orderItemId,
    target_expected_version: values.data.expectedVersion,
    target_quantity: values.data.quantity,
    target_mode: values.data.mode,
    target_reason: values.data.reason,
  });
  if (error) return { ok: false, code: "void_failed", message: voidErrorMessage(error.message) };

  const payload = data as { version?: unknown; orderCancelled?: unknown } | null;
  if (!payload || typeof payload.version !== "number") {
    return { ok: false, code: "invalid_rpc_response", message: "Yanıt doğrulanamadı." };
  }
  const { tenant, branch, orderId } = values.data;
  revalidatePath(`/app/${tenant}/${branch}/siparis/${orderId}`);
  revalidatePath(`/app/${tenant}/${branch}/masalar`);
  revalidatePath(`/app/${tenant}/${branch}/mutfak`);
  revalidatePath(`/app/${tenant}/${branch}/kasa`);
  const orderCancelled = payload.orderCancelled === true;
  return {
    ok: true,
    orderId,
    version: payload.version,
    orderCancelled,
    message: orderCancelled
      ? "Adisyonda ürün kalmadı; adisyon iptal edildi."
      : values.data.mode === "void"
        ? "Ürün iptal edildi. Yönetici ve mutfak bilgilendirildi."
        : "Ürün ikram olarak işaretlendi. Yönetici bilgilendirildi.",
  };
}
