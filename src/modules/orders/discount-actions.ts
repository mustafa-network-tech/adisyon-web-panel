"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspacePermission } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  discountErrorMessage,
  itemDiscountInputSchema,
  orderDiscountInputSchema,
} from "./discount";
import type { OrderActionResult } from "./types";

function revalidateOrder(tenant: string, branch: string, orderId: string) {
  revalidatePath(`/app/${tenant}/${branch}/siparis/${orderId}`);
  revalidatePath(`/app/${tenant}/${branch}/kasa`);
  revalidatePath(`/app/${tenant}/${branch}/masalar`);
}

function toResult(data: unknown, orderId: string, message: string): OrderActionResult {
  const payload = data as { version?: unknown } | null;
  if (!payload || typeof payload.version !== "number") {
    return { ok: false, code: "invalid_rpc_response", message: "İndirim yanıtı doğrulanamadı." };
  }
  return { ok: true, message, orderId, version: payload.version };
}

export async function applyOrderDiscountAction(input: unknown): Promise<OrderActionResult> {
  const values = orderDiscountInputSchema.safeParse(input);
  if (!values.success) {
    return { ok: false, code: "invalid_input", message: "İndirim bilgilerini kontrol edin (gerekçe en az 3 karakter)." };
  }
  const context = await requireWorkspacePermission(values.data.tenant, values.data.branch, ["discounts.apply"]);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("apply_order_discount", {
    target_tenant_id: context.tenantId,
    target_branch_id: context.branchId,
    target_order_id: values.data.orderId,
    target_expected_version: values.data.expectedVersion,
    target_type: values.data.kind,
    target_value: values.data.value,
    target_reason: values.data.reason || null,
  });
  if (error) return { ok: false, code: "discount_failed", message: discountErrorMessage(error.message) };

  const result = toResult(data, values.data.orderId, values.data.kind === "none" ? "Adisyon indirimi kaldırıldı." : "Adisyon indirimi uygulandı.");
  if (result.ok) revalidateOrder(values.data.tenant, values.data.branch, values.data.orderId);
  return result;
}

export async function applyItemDiscountAction(input: unknown): Promise<OrderActionResult> {
  const values = itemDiscountInputSchema.safeParse(input);
  if (!values.success) {
    return { ok: false, code: "invalid_input", message: "İndirim bilgilerini kontrol edin (gerekçe en az 3 karakter)." };
  }
  const context = await requireWorkspacePermission(values.data.tenant, values.data.branch, ["discounts.apply"]);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("apply_item_discount", {
    target_tenant_id: context.tenantId,
    target_branch_id: context.branchId,
    target_order_id: values.data.orderId,
    target_order_item_id: values.data.orderItemId,
    target_expected_version: values.data.expectedVersion,
    target_type: values.data.kind,
    target_value: values.data.value,
    target_reason: values.data.reason || null,
  });
  if (error) return { ok: false, code: "discount_failed", message: discountErrorMessage(error.message) };

  const result = toResult(data, values.data.orderId, values.data.kind === "none" ? "Ürün indirimi kaldırıldı." : "Ürün indirimi uygulandı.");
  if (result.ok) revalidateOrder(values.data.tenant, values.data.branch, values.data.orderId);
  return result;
}
