import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  OrderItemOption,
  OrderItemSnapshot,
  OrderSnapshot,
  OrderStatus,
  OrderStatusHistoryItem,
} from "./types";

type OrderRow = {
  id: string;
  table_id: string | null;
  created_by: string | null;
  order_number: number;
  status: OrderStatus;
  guest_count: number;
  subtotal_minor: number;
  tax_minor: number;
  total_minor: number;
  discount_minor: number;
  discount_type: "amount" | "percent" | null;
  discount_value: number;
  discount_reason: string | null;
  version: number;
  opened_at: string;
};

type OrderItemRow = {
  id: string;
  product_id: string | null;
  kitchen_station_id: string | null;
  fulfillment: "kitchen" | "direct";
  source: "staff" | "qr";
  product_name: string;
  quantity: number;
  sent_quantity: number;
  unit_price_minor: number;
  list_unit_price_minor: number | null;
  discount_reason: string | null;
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
      "id, table_id, created_by, order_number, status, guest_count, subtotal_minor, tax_minor, total_minor, discount_minor, discount_type, discount_value, discount_reason, version, opened_at",
    )
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .eq("branch_id", branchId)
    .maybeSingle();

  if (orderError) throw new Error("Sipariş Supabase üzerinden okunamadı.");
  if (!orderData) return null;
  const order = orderData as OrderRow;

  const [itemsResult, historyResult, tableResult, creatorResult] = await Promise.all([
    supabase
      .from("order_items")
      .select(
        "id, product_id, kitchen_station_id, fulfillment, source, product_name, quantity, sent_quantity, unit_price_minor, list_unit_price_minor, discount_reason, tax_rate, line_total_minor, notes",
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
    order.created_by
      ? supabase.from("profiles").select("full_name").eq("id", order.created_by).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (itemsResult.error || historyResult.error || tableResult.error || creatorResult.error) {
    throw new Error("Sipariş ayrıntıları Supabase üzerinden okunamadı.");
  }

  const itemRows = (itemsResult.data || []) as OrderItemRow[];
  const optionsResult = itemRows.length
    ? await supabase
        .from("order_item_options")
        .select("order_item_id, group_name, kind, choice_name, price_delta_minor")
        .eq("tenant_id", tenantId)
        .eq("branch_id", branchId)
        .in("order_item_id", itemRows.map((item) => item.id))
        .order("created_at")
    : { data: [], error: null };
  if (optionsResult.error) throw new Error("Ürün seçenekleri okunamadı.");
  const optionsByItem = new Map<string, OrderItemOption[]>();
  for (const row of optionsResult.data || []) {
    const list = optionsByItem.get(row.order_item_id as string) || [];
    list.push({
      groupName: row.group_name as string,
      kind: row.kind as OrderItemOption["kind"],
      name: row.choice_name as string,
      priceDeltaMinor: Number(row.price_delta_minor),
    });
    optionsByItem.set(row.order_item_id as string, list);
  }

  const items: OrderItemSnapshot[] = itemRows.map((item) => ({
    id: item.id,
    productId: item.product_id,
    kitchenStationId: item.kitchen_station_id,
    fulfillment: item.fulfillment,
    source: item.source,
    productName: item.product_name,
    options: optionsByItem.get(item.id) || [],
    quantity: item.quantity,
    sentQuantity: item.sent_quantity,
    unitPriceMinor: Number(item.unit_price_minor),
    listUnitPriceMinor: item.list_unit_price_minor === null ? null : Number(item.list_unit_price_minor),
    discountReason: item.discount_reason,
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
    serverName: order.created_by ? creatorResult.data?.full_name || "Ekip üyesi" : null,
    status: order.status,
    guestCount: order.guest_count,
    subtotalMinor: Number(order.subtotal_minor),
    taxMinor: Number(order.tax_minor),
    totalMinor: Number(order.total_minor),
    discountMinor: Number(order.discount_minor),
    discountType: order.discount_type,
    discountValue: Number(order.discount_value),
    discountReason: order.discount_reason,
    version: order.version,
    openedAt: order.opened_at,
    items,
    history,
  };
}
