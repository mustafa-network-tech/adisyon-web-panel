"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspacePermission } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { OrderActionResult } from "./types";
import {
  appendOrderItemsInputSchema,
  openOrderInputSchema,
  submitOrderInputSchema,
  updateOrderItemInputSchema,
} from "./validation";

type RpcPayload = {
  orderId?: unknown;
  version?: unknown;
};

function failure(code: string, message: string): OrderActionResult {
  return { ok: false, code, message };
}

function mapRpcError(message: string): OrderActionResult {
  const errors: Record<string, string> = {
    order_version_conflict:
      "Sipariş başka bir cihazda değişti. Güncel veriler yükleniyor; işlemi yeniden deneyin.",
    table_has_active_order: "Bu masada zaten aktif bir sipariş bulunuyor.",
    table_not_available: "Bu masa şu anda siparişe açılamıyor.",
    product_not_available: "Seçilen ürünlerden biri artık satışta değil.",
    product_sold_out: "Seçilen ürünlerden biri bugün tükendi.",
    product_station_required:
      "Mutfağa göndermek için tüm ürünlere mutfak istasyonu atanmalıdır.",
    order_has_no_pending_items: "Mutfağa gönderilecek yeni ürün bulunmuyor.",
    order_not_editable: "Bu sipariş artık düzenlenemez.",
    order_not_submittable: "Bu sipariş mutfağa gönderilemez.",
    order_item_not_editable:
      "Mutfağa gönderilmiş miktarın altına düşülemez.",
  };
  const code = Object.keys(errors).find((item) => message.includes(item));
  return failure(code || "order_operation_failed", code ? errors[code] : "Sipariş işlemi tamamlanamadı.");
}

function successFromRpc(
  data: unknown,
  message: string,
): OrderActionResult {
  const payload = data as RpcPayload | null;
  if (
    !payload ||
    typeof payload.orderId !== "string" ||
    typeof payload.version !== "number"
  ) {
    return failure("invalid_rpc_response", "Sipariş yanıtı doğrulanamadı.");
  }
  return {
    ok: true,
    message,
    orderId: payload.orderId,
    version: payload.version,
  };
}

function revalidateOrderRoutes(
  tenant: string,
  branch: string,
  orderId?: string,
) {
  revalidatePath(`/app/${tenant}/${branch}/masalar`);
  revalidatePath(`/app/${tenant}/${branch}/mutfak`);
  if (orderId) revalidatePath(`/app/${tenant}/${branch}/siparis/${orderId}`);
}

export async function openOrderAction(input: unknown): Promise<OrderActionResult> {
  const values = openOrderInputSchema.safeParse(input);
  if (!values.success) return failure("invalid_input", "Sipariş bilgilerini kontrol edin.");

  const context = await requireWorkspacePermission(
    values.data.tenant,
    values.data.branch,
    ["orders.create"],
  );
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("open_order", {
    target_tenant_id: context.tenantId,
    target_branch_id: context.branchId,
    target_table_id: values.data.tableId,
    target_guest_count: values.data.guestCount,
    target_items: values.data.items,
    target_idempotency_key: values.data.idempotencyKey,
  });
  if (error) return mapRpcError(error.message);

  const result = successFromRpc(data, "Sipariş açıldı.");
  if (result.ok) revalidateOrderRoutes(values.data.tenant, values.data.branch, result.orderId);
  return result;
}

export async function appendOrderItemsAction(
  input: unknown,
): Promise<OrderActionResult> {
  const values = appendOrderItemsInputSchema.safeParse(input);
  if (!values.success) return failure("invalid_input", "Ürün bilgilerini kontrol edin.");

  const context = await requireWorkspacePermission(
    values.data.tenant,
    values.data.branch,
    ["orders.update"],
  );
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("append_order_items", {
    target_tenant_id: context.tenantId,
    target_branch_id: context.branchId,
    target_order_id: values.data.orderId,
    target_expected_version: values.data.expectedVersion,
    target_items: values.data.items,
    target_idempotency_key: values.data.idempotencyKey,
  });
  if (error) return mapRpcError(error.message);

  const result = successFromRpc(data, "Ürünler siparişe eklendi.");
  if (result.ok) revalidateOrderRoutes(values.data.tenant, values.data.branch, result.orderId);
  return result;
}

export async function updateOrderItemAction(
  input: unknown,
): Promise<OrderActionResult> {
  const values = updateOrderItemInputSchema.safeParse(input);
  if (!values.success) return failure("invalid_input", "Ürün bilgilerini kontrol edin.");

  const context = await requireWorkspacePermission(
    values.data.tenant,
    values.data.branch,
    ["orders.update"],
  );
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("update_order_item", {
    target_tenant_id: context.tenantId,
    target_branch_id: context.branchId,
    target_order_id: values.data.orderId,
    target_order_item_id: values.data.orderItemId,
    target_expected_version: values.data.expectedVersion,
    target_quantity: values.data.quantity,
    target_notes: values.data.notes,
    target_idempotency_key: values.data.idempotencyKey,
  });
  if (error) return mapRpcError(error.message);

  const result = successFromRpc(data, "Sipariş ürünü güncellendi.");
  if (result.ok) revalidateOrderRoutes(values.data.tenant, values.data.branch, result.orderId);
  return result;
}

export async function submitOrderAction(
  input: unknown,
): Promise<OrderActionResult> {
  const values = submitOrderInputSchema.safeParse(input);
  if (!values.success) return failure("invalid_input", "Sipariş bilgilerini kontrol edin.");

  const context = await requireWorkspacePermission(
    values.data.tenant,
    values.data.branch,
    ["orders.update"],
  );
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("submit_order", {
    target_tenant_id: context.tenantId,
    target_branch_id: context.branchId,
    target_order_id: values.data.orderId,
    target_expected_version: values.data.expectedVersion,
    target_idempotency_key: values.data.idempotencyKey,
  });
  if (error) return mapRpcError(error.message);

  const result = successFromRpc(data, "Sipariş gönderildi.");
  if (result.ok) revalidateOrderRoutes(values.data.tenant, values.data.branch, result.orderId);
  return result;
}
