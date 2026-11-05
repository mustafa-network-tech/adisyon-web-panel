import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { describeVoid } from "@/modules/orders/void";

export type RecentNotification = {
  id: string;
  kind: "waiter" | "bill" | "void" | "comp" | "ready";
  title: string;
  text: string;
  at: string;
  /** "Karşılandı" for calls that staff already answered. */
  state?: string;
};

type Scope = { tenantId: string; branchId: string; userId: string; overseesFloor: boolean };

/** Last 24 hours of what the alerts were about, read from tables the person is allowed to see. */
export async function getRecentNotifications(scope: Scope): Promise<RecentNotification[]> {
  const supabase = await createSupabaseServerClient();
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();

  const [callsResult, voidsResult, readyResult] = await Promise.all([
    supabase
      .from("waiter_calls")
      .select("id, table_id, kind, created_at, acknowledged_at")
      .eq("tenant_id", scope.tenantId)
      .eq("branch_id", scope.branchId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("order_item_voids")
      .select("id, mode, quantity, product_name, reason, actor_name, table_label, created_at")
      .eq("tenant_id", scope.tenantId)
      .eq("branch_id", scope.branchId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("kitchen_tickets")
      .select("id, order_id, ready_at")
      .eq("tenant_id", scope.tenantId)
      .eq("branch_id", scope.branchId)
      .gte("ready_at", since)
      .order("ready_at", { ascending: false })
      .limit(30),
  ]);

  const calls = callsResult.data || [];
  const tickets = readyResult.data || [];
  const tableIds = [...new Set(calls.map((call) => call.table_id as string))];
  const orderIds = [...new Set(tickets.map((ticket) => ticket.order_id as string))];
  const [tablesResult, ordersResult] = await Promise.all([
    tableIds.length ? supabase.from("restaurant_tables").select("id, label").in("id", tableIds) : Promise.resolve({ data: [] }),
    orderIds.length ? supabase.from("orders").select("id, table_id, created_by, order_number").in("id", orderIds) : Promise.resolve({ data: [] }),
  ]);
  const orders = ordersResult.data || [];
  const orderTableIds = [...new Set(orders.map((order) => order.table_id as string | null).filter(Boolean))] as string[];
  const orderTables = orderTableIds.length
    ? (await supabase.from("restaurant_tables").select("id, label").in("id", orderTableIds)).data || []
    : [];
  const labels = new Map([...(tablesResult.data || []), ...orderTables].map((row) => [row.id as string, row.label as string]));
  const orderById = new Map(orders.map((order) => [order.id as string, order]));

  const items: RecentNotification[] = [];
  for (const call of calls) {
    const table = labels.get(call.table_id as string) || "Masa";
    items.push({
      id: `call:${call.id}`,
      kind: call.kind as "waiter" | "bill",
      title: `${table} · ${call.kind === "waiter" ? "garson çağırdı" : "hesap istedi"}`,
      text: "Müşteri QR menüden bildirdi.",
      at: call.created_at as string,
      state: call.acknowledged_at ? "Karşılandı" : "Bekliyor",
    });
  }
  for (const row of voidsResult.data || []) {
    const mode = row.mode as "void" | "comp";
    items.push({
      id: `void:${row.id}`,
      kind: mode === "void" ? "void" : "comp",
      title: `${row.table_label || "Masa"} · ${mode === "void" ? "ürün iptali" : "ikram"}`,
      text: describeVoid({ mode, quantity: Number(row.quantity), productName: row.product_name as string, reason: row.reason as string, actorName: row.actor_name as string | null }),
      at: row.created_at as string,
    });
  }
  for (const ticket of tickets) {
    const order = orderById.get(ticket.order_id as string);
    if (!order) continue;
    const mine = order.created_by === null || order.created_by === scope.userId || scope.overseesFloor;
    if (!mine) continue;
    items.push({
      id: `ready:${ticket.id}`,
      kind: "ready",
      title: `${order.table_id ? labels.get(order.table_id as string) || "Masa" : "Paket"} · sipariş hazır`,
      text: `#${order.order_number} servise hazır oldu.`,
      at: ticket.ready_at as string,
    });
  }
  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40);
}
