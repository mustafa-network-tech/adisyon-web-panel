"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspacePermission } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { OrderActionResult } from "./types";

const uuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const route = {
  tenant: z.string().trim().min(1).max(100),
  branch: z.string().trim().min(1).max(100),
};

const moveSchema = z.object({
  ...route,
  orderId: uuid,
  expectedVersion: z.number().int().positive(),
  tableId: uuid,
});

const mergeSchema = z.object({
  ...route,
  sourceOrderId: uuid,
  sourceVersion: z.number().int().positive(),
  destinationOrderId: uuid,
});

const errors: Record<string, string> = {
  order_update_denied: "Sipariş düzenleme yetkiniz yok.",
  order_not_editable: "Kapanmış veya iptal edilmiş sipariş taşınamaz/birleştirilemez.",
  order_version_conflict: "Sipariş başka bir cihazda değişti. Güncel veriler yükleniyor; işlemi yeniden deneyin.",
  same_table: "Sipariş zaten bu masada.",
  same_order: "Bir adisyon kendisiyle birleştirilemez.",
  table_not_available: "Seçilen masa şu anda kullanılamıyor.",
  table_has_active_order: "Seçilen masada zaten açık bir adisyon var. Birleştirmeyi kullanın.",
  merge_source_has_payments: "Ödeme alınmış bir adisyon başka bir adisyona birleştirilemez.",
  merge_source_has_discount: "Birleştirilecek adisyonda indirim var; önce indirimi kaldırın.",
};

function mapError(message: string): OrderActionResult {
  const code = Object.keys(errors).find((item) => message.includes(item));
  return { ok: false, code: code || "table_operation_failed", message: code ? errors[code] : "İşlem tamamlanamadı." };
}

function refresh(tenant: string, branch: string, ...orderIds: string[]) {
  revalidatePath(`/app/${tenant}/${branch}/masalar`);
  revalidatePath(`/app/${tenant}/${branch}/mutfak`);
  revalidatePath(`/app/${tenant}/${branch}/kasa`);
  for (const orderId of orderIds) revalidatePath(`/app/${tenant}/${branch}/siparis/${orderId}`);
}

export async function moveOrderToTableAction(input: unknown): Promise<OrderActionResult> {
  const values = moveSchema.safeParse(input);
  if (!values.success) return { ok: false, code: "invalid_input", message: "Masa seçimini kontrol edin." };
  const context = await requireWorkspacePermission(values.data.tenant, values.data.branch, ["orders.update"]);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("move_order_to_table", {
    target_tenant_id: context.tenantId,
    target_branch_id: context.branchId,
    target_order_id: values.data.orderId,
    target_expected_version: values.data.expectedVersion,
    target_table_id: values.data.tableId,
  });
  if (error) return mapError(error.message);

  const version = (data as { version?: unknown } | null)?.version;
  if (typeof version !== "number") return { ok: false, code: "invalid_rpc_response", message: "Yanıt doğrulanamadı." };
  refresh(values.data.tenant, values.data.branch, values.data.orderId);
  return { ok: true, message: "Adisyon yeni masaya taşındı.", orderId: values.data.orderId, version };
}

export async function mergeOrdersAction(input: unknown): Promise<OrderActionResult> {
  const values = mergeSchema.safeParse(input);
  if (!values.success) return { ok: false, code: "invalid_input", message: "Birleştirilecek adisyonu seçin." };
  const context = await requireWorkspacePermission(values.data.tenant, values.data.branch, ["orders.update"]);

  const supabase = await createSupabaseServerClient();
  // The destination's current version is read here; the database still rejects stale versions.
  const { data: destination } = await supabase
    .from("orders")
    .select("version")
    .eq("tenant_id", context.tenantId)
    .eq("branch_id", context.branchId)
    .eq("id", values.data.destinationOrderId)
    .maybeSingle();
  if (!destination) return { ok: false, code: "order_not_editable", message: errors.order_not_editable };

  const { data, error } = await supabase.rpc("merge_orders", {
    target_tenant_id: context.tenantId,
    target_branch_id: context.branchId,
    target_source_order_id: values.data.sourceOrderId,
    target_source_version: values.data.sourceVersion,
    target_destination_order_id: values.data.destinationOrderId,
    target_destination_version: Number(destination.version),
  });
  if (error) return mapError(error.message);

  const version = (data as { version?: unknown } | null)?.version;
  if (typeof version !== "number") return { ok: false, code: "invalid_rpc_response", message: "Yanıt doğrulanamadı." };
  refresh(values.data.tenant, values.data.branch, values.data.sourceOrderId, values.data.destinationOrderId);
  return { ok: true, message: "Adisyonlar birleştirildi.", orderId: values.data.destinationOrderId, version };
}
