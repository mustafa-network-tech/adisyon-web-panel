import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  OrderItemSnapshot,
  OrderSnapshot,
  OrderStatus,
  OrderStatusHistoryItem,
} from "./types";

type OrderRow = {
  id: string;
  table_id: string | null;
  order_number: number;
  status: OrderStatus;
  guest_count: number;
  subtotal_minor: number;
  tax_minor: number;
  total_minor: number;
  version: number;
  opened_at: string;
};

type OrderItemRow = {
  id: string;
  product_id: string | null;
  kitchen_station_id: string | null;
  fulfillment: "kitchen" | "direct";
  product_name: string;
  quantity: number;
  sent_quantity: number;
  unit_price_minor: number;
  tax_rate: number | string;
  line_total_minor: number;
  notes: string | null;
};

type HistoryRow = {
  id: number;
  status: OrderStatus;
  actor_user_id: string | null;
  created_at: string;
};

export async function getOrderSnapshot(
  tenantId: string,
  branchId: string,
  orderId: string,
): Promise<OrderSnapshot | null> {
  const supabase = await createSupabaseServerClient();
  const { data: orderData, error: orderError } = await supabase
    .from("orders")
    .select(
      "id, table_id, order_number, status, guest_count, subtotal_minor, tax_minor, total_minor, version, opened_at",
    )
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .eq("branch_id", branchId)
    .maybeSingle();

  if (orderError) throw new Error("Sipariş Supabase üzerinden okunamadı.");
  if (!orderData) return null;
  const order = orderData as OrderRow;

  const [itemsResult, historyResult, tableResult] = await Promise.all([
    supabase
      .from("order_items")
      .select(
        "id, product_id, kitchen_station_id, fulfillment, product_name, quantity, sent_quantity, unit_price_minor, tax_rate, line_total_minor, notes",
      )
      .eq("tenant_id", tenantId)
      .eq("branch_id", branchId)
      .eq("order_id", orderId)
      .order("created_at"),
    supabase
      .from("order_status_history")
      .select("id, status, actor_user_id, created_at")
      .eq("tenant_id", tenantId)
      .eq("branch_id", branchId)
      .eq("order_id", orderId)
      .order("created_at", { ascending: false }),
    order.table_id
      ? supabase
          .from("restaurant_tables")
          .select("label")
          .eq("tenant_id", tenantId)
          .eq("branch_id", branchId)
          .eq("id", order.table_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (itemsResult.error || historyResult.error || tableResult.error) {
    throw new Error("Sipariş ayrıntıları Supabase üzerinden okunamadı.");
  }

  const items: OrderItemSnapshot[] = (
    (itemsResult.data || []) as OrderItemRow[]
  ).map((item) => ({
    id: item.id,
    productId: item.product_id,
    kitchenStationId: item.kitchen_station_id,
    fulfillment: item.fulfillment,
    productName: item.product_name,
    quantity: item.quantity,
    sentQuantity: item.sent_quantity,
    unitPriceMinor: Number(item.unit_price_minor),
    taxRate: Number(item.tax_rate),
    lineTotalMinor: Number(item.line_total_minor),
    notes: item.notes,
  }));
  const history: OrderStatusHistoryItem[] = (
    (historyResult.data || []) as HistoryRow[]
  ).map((item) => ({
    id: Number(item.id),
    status: item.status,
    actorUserId: item.actor_user_id,
    createdAt: item.created_at,
  }));

  return {
    id: order.id,
    orderNumber: Number(order.order_number),
    tableId: order.table_id,
    tableLabel: tableResult.data?.label || "Paket / Masasız",
    status: order.status,
    guestCount: order.guest_count,
    subtotalMinor: Number(order.subtotal_minor),
    taxMinor: Number(order.tax_minor),
    totalMinor: Number(order.total_minor),
    version: order.version,
    openedAt: order.opened_at,
    items,
    history,
  };
}
