import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  ActiveKitchenTicketStatus,
  KitchenSnapshot,
  KitchenTicket,
} from "./types";

type TicketRow = {
  id: string;
  order_id: string;
  kitchen_station_id: string;
  status: ActiveKitchenTicketStatus;
  sent_at: string;
  started_at: string | null;
  ready_at: string | null;
};

type OrderRow = {
  id: string;
  order_number: number;
  table_id: string | null;
  created_by: string | null;
};

type TicketItemRow = {
  ticket_id: string;
  order_item_id: string;
  quantity: number;
};

type OrderItemRow = {
  id: string;
  product_name: string;
  notes: string | null;
};

export async function getKitchenSnapshot(
  tenantId: string,
  branchId: string,
): Promise<KitchenSnapshot> {
  const supabase = await createSupabaseServerClient();
  const [ticketsResult, stationsResult] = await Promise.all([
    supabase
      .from("kitchen_tickets")
      .select(
        "id, order_id, kitchen_station_id, status, sent_at, started_at, ready_at",
      )
      .eq("tenant_id", tenantId)
      .eq("branch_id", branchId)
      .in("status", ["new", "preparing", "ready"])
      .order("sent_at"),
    supabase
      .from("kitchen_stations")
      .select("id, name, color")
      .eq("tenant_id", tenantId)
      .eq("branch_id", branchId)
      .eq("is_active", true)
      .order("name"),
  ]);
  if (ticketsResult.error || stationsResult.error) {
    throw new Error("Mutfak verileri Supabase üzerinden okunamadı.");
  }

  const ticketRows = (ticketsResult.data || []) as TicketRow[];
  const stationRows = stationsResult.data || [];
  if (ticketRows.length === 0) {
    return {
      tickets: [],
      stations: stationRows.map((station) => ({
        id: station.id,
        name: station.name,
        color: station.color,
      })),
    };
  }

  const ticketIds = ticketRows.map((ticket) => ticket.id);
  const orderIds = [...new Set(ticketRows.map((ticket) => ticket.order_id))];
  const [ordersResult, ticketItemsResult] = await Promise.all([
    supabase
      .from("orders")
      .select("id, order_number, table_id, created_by")
      .eq("tenant_id", tenantId)
      .eq("branch_id", branchId)
      .in("id", orderIds),
    supabase
      .from("kitchen_ticket_items")
      .select("ticket_id, order_item_id, quantity")
      .eq("tenant_id", tenantId)
      .in("ticket_id", ticketIds),
  ]);
  if (ordersResult.error || ticketItemsResult.error) {
    throw new Error("Mutfak fişi ayrıntıları okunamadı.");
  }

  const orders = (ordersResult.data || []) as OrderRow[];
  const ticketItems = (ticketItemsResult.data || []) as TicketItemRow[];
  const tableIds = [
    ...new Set(orders.map((order) => order.table_id).filter(Boolean)),
  ] as string[];
  const userIds = [...new Set(orders.map((order) => order.created_by).filter(Boolean))] as string[];
  const orderItemIds = [
    ...new Set(ticketItems.map((item) => item.order_item_id)),
  ];

  const [tablesResult, profilesResult, orderItemsResult] = await Promise.all([
    tableIds.length
      ? supabase
          .from("restaurant_tables")
          .select("id, label")
          .eq("tenant_id", tenantId)
          .eq("branch_id", branchId)
          .in("id", tableIds)
      : Promise.resolve({ data: [], error: null }),
    userIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", userIds)
      : Promise.resolve({ data: [], error: null }),
    orderItemIds.length
      ? supabase
          .from("order_items")
          .select("id, product_name, notes")
          .eq("tenant_id", tenantId)
          .eq("branch_id", branchId)
          .in("id", orderItemIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (tablesResult.error || profilesResult.error || orderItemsResult.error) {
    throw new Error("Mutfak fişi ilişkileri okunamadı.");
  }

  const stationMap = new Map(stationRows.map((row) => [row.id, row]));
  const orderMap = new Map(orders.map((row) => [row.id, row]));
  const tableMap = new Map(
    (tablesResult.data || []).map((row) => [row.id, row.label]),
  );
  const profileMap = new Map(
    (profilesResult.data || []).map((row) => [row.id, row.full_name]),
  );
  const orderItemMap = new Map(
    ((orderItemsResult.data || []) as OrderItemRow[]).map((row) => [row.id, row]),
  );
  const itemsByTicket = new Map<string, TicketItemRow[]>();
  for (const item of ticketItems) {
    itemsByTicket.set(item.ticket_id, [
      ...(itemsByTicket.get(item.ticket_id) || []),
      item,
    ]);
  }

  const tickets: KitchenTicket[] = ticketRows.flatMap((ticket) => {
    const order = orderMap.get(ticket.order_id);
    const station = stationMap.get(ticket.kitchen_station_id);
    if (!order || !station) return [];
    return [
      {
        id: ticket.id,
        orderId: ticket.order_id,
        orderNumber: Number(order.order_number),
        tableLabel: order.table_id
          ? tableMap.get(order.table_id) || "Masa"
          : "Paket",
        stationId: station.id,
        stationName: station.name,
        stationColor: station.color,
        status: ticket.status,
        sentAt: ticket.sent_at,
        startedAt: ticket.started_at,
        readyAt: ticket.ready_at,
        serverName: (order.created_by ? profileMap.get(order.created_by) : "Müşteri (QR)") || "Ekip üyesi",
        items: (itemsByTicket.get(ticket.id) || []).flatMap((link) => {
          const item = orderItemMap.get(link.order_item_id);
          return item
            ? [
                {
                  orderItemId: item.id,
                  quantity: link.quantity,
                  name: item.product_name,
                  note: item.notes,
                },
              ]
            : [];
        }),
      },
    ];
  });

  return {
    tickets,
    stations: stationRows.map((station) => ({
      id: station.id,
      name: station.name,
      color: station.color,
    })),
  };
}
