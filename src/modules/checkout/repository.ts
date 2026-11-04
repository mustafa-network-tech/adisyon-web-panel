import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  CashSession,
  CheckoutOrder,
  CheckoutSnapshot,
  PaymentMethod,
  RecentPayment,
} from "@/modules/cash-register/types";

export async function getCheckoutSnapshot(
  tenantId: string,
  branchId: string,
): Promise<CheckoutSnapshot> {
  const supabase = await createSupabaseServerClient();
  const [registersResult, sessionsResult, ordersResult, paymentsResult, refundsResult, allocationsResult] = await Promise.all([
    supabase.from("cash_registers").select("id, name").eq("tenant_id", tenantId).eq("branch_id", branchId).eq("is_active", true).order("name"),
    supabase.from("cash_sessions").select("id, cash_register_id, opening_minor, opened_by, opened_at").eq("tenant_id", tenantId).eq("branch_id", branchId).eq("status", "open").order("opened_at"),
    supabase.from("orders").select("id, order_number, table_id, created_by, opened_at, total_minor").eq("tenant_id", tenantId).eq("branch_id", branchId).in("status", ["ready", "served"]).order("opened_at"),
    supabase.from("payments").select("id, order_id, cash_session_id, method, amount_minor, paid_at").eq("tenant_id", tenantId).eq("branch_id", branchId).eq("status", "completed").order("paid_at", { ascending: false }),
    supabase.from("payment_refunds").select("id, payment_id, cash_session_id, amount_minor").eq("tenant_id", tenantId).eq("branch_id", branchId),
    supabase.from("payment_allocations").select("payment_id, order_id, order_item_id, quantity").eq("tenant_id", tenantId).eq("branch_id", branchId),
  ]);
  const initialError = registersResult.error || sessionsResult.error || ordersResult.error || paymentsResult.error || refundsResult.error || allocationsResult.error;
  if (initialError) throw new Error("Kasa verileri Supabase üzerinden okunamadı.");

  const registers = registersResult.data || [];
  const sessions = sessionsResult.data || [];
  const orders = ordersResult.data || [];
  const payments = paymentsResult.data || [];
  const refunds = refundsResult.data || [];
  const allocations = allocationsResult.data || [];
  const orderIds = orders.map((order) => order.id);
  const recentPaymentOrderIds = [
    ...new Set(payments.slice(0, 20).map((payment) => payment.order_id)),
  ];
  const missingRecentOrderIds = recentPaymentOrderIds.filter(
    (orderId) => !orderIds.includes(orderId),
  );
  const tableIds = [...new Set(orders.map((order) => order.table_id).filter(Boolean))] as string[];
  const userIds = [...new Set([...orders.map((order) => order.created_by), ...sessions.map((session) => session.opened_by)])];
  const sessionIds = sessions.map((session) => session.id);

  const [itemsResult, tablesResult, profilesResult, movementsResult, recentOrdersResult] = await Promise.all([
    orderIds.length ? supabase.from("order_items").select("id, order_id, product_name, quantity, unit_price_minor").eq("tenant_id", tenantId).eq("branch_id", branchId).in("order_id", orderIds).order("created_at") : Promise.resolve({ data: [], error: null }),
    tableIds.length ? supabase.from("restaurant_tables").select("id, label").eq("tenant_id", tenantId).eq("branch_id", branchId).in("id", tableIds) : Promise.resolve({ data: [], error: null }),
    userIds.length ? supabase.from("profiles").select("id, full_name").in("id", userIds) : Promise.resolve({ data: [], error: null }),
    sessionIds.length ? supabase.from("cash_movements").select("cash_session_id, movement_type, amount_minor").eq("tenant_id", tenantId).in("cash_session_id", sessionIds) : Promise.resolve({ data: [], error: null }),
    missingRecentOrderIds.length ? supabase.from("orders").select("id, order_number").eq("tenant_id", tenantId).eq("branch_id", branchId).in("id", missingRecentOrderIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (itemsResult.error || tablesResult.error || profilesResult.error || movementsResult.error || recentOrdersResult.error) throw new Error("Kasa ilişkili verileri okunamadı.");

  const registerMap = new Map(registers.map((item) => [item.id, item.name]));
  const tableMap = new Map((tablesResult.data || []).map((item) => [item.id, item.label]));
  const profileMap = new Map((profilesResult.data || []).map((item) => [item.id, item.full_name]));
  const refundByPayment = new Map<string, number>();
  for (const refund of refunds) refundByPayment.set(refund.payment_id, (refundByPayment.get(refund.payment_id) || 0) + Number(refund.amount_minor));
  const allocatedByItem = new Map<string, number>();
  for (const allocation of allocations) allocatedByItem.set(allocation.order_item_id, (allocatedByItem.get(allocation.order_item_id) || 0) + allocation.quantity);
  const itemsByOrder = new Map<string, typeof itemsResult.data>();
  for (const item of itemsResult.data || []) itemsByOrder.set(item.order_id, [...(itemsByOrder.get(item.order_id) || []), item]);

  const checkoutOrders: CheckoutOrder[] = orders.flatMap((order) => {
    const orderPayments = payments.filter((payment) => payment.order_id === order.id);
    const paidMinor = orderPayments.reduce((sum, payment) => sum + Number(payment.amount_minor) - (refundByPayment.get(payment.id) || 0), 0);
    const outstandingMinor = Number(order.total_minor) - paidMinor;
    if (outstandingMinor <= 0) return [];
    return [{
      id: order.id,
      orderNumber: Number(order.order_number),
      tableLabel: order.table_id ? tableMap.get(order.table_id) || "Masa" : "Paket",
      serverName: profileMap.get(order.created_by) || "Ekip üyesi",
      openedAt: order.opened_at,
      totalMinor: Number(order.total_minor),
      paidMinor,
      outstandingMinor,
      items: (itemsByOrder.get(order.id) || []).map((item) => ({ id: item.id, name: item.product_name, quantity: item.quantity, allocatedQuantity: allocatedByItem.get(item.id) || 0, unitPriceMinor: Number(item.unit_price_minor) })),
    }];
  });

  const cashSessions: CashSession[] = sessions.map((session) => {
    const cashPayments = payments.filter((payment) => payment.cash_session_id === session.id && payment.method === "cash");
    const cashPaid = cashPayments.reduce((sum, payment) => sum + Number(payment.amount_minor), 0);
    const cashRefunded = refunds.filter((refund) => refund.cash_session_id === session.id && cashPayments.some((payment) => payment.id === refund.payment_id)).reduce((sum, refund) => sum + Number(refund.amount_minor), 0);
    const movementNet = (movementsResult.data || []).filter((movement) => movement.cash_session_id === session.id).reduce((sum, movement) => sum + (movement.movement_type === "income" ? Number(movement.amount_minor) : -Number(movement.amount_minor)), 0);
    return { id: session.id, cashRegisterId: session.cash_register_id, cashRegisterName: registerMap.get(session.cash_register_id) || "Kasa", openingMinor: Number(session.opening_minor), openedAt: session.opened_at, openedByName: profileMap.get(session.opened_by) || "Ekip üyesi", expectedMinor: Number(session.opening_minor) + cashPaid - cashRefunded + movementNet };
  });

  const orderNumberMap = new Map([
    ...orders.map((order) => [order.id, Number(order.order_number)] as const),
    ...(recentOrdersResult.data || []).map((order) => [order.id, Number(order.order_number)] as const),
  ]);
  const recentPayments: RecentPayment[] = payments.slice(0, 20).map((payment) => ({ id: payment.id, orderNumber: orderNumberMap.get(payment.order_id) || 0, method: payment.method as PaymentMethod, amountMinor: Number(payment.amount_minor), refundedMinor: refundByPayment.get(payment.id) || 0, paidAt: payment.paid_at || new Date(0).toISOString() }));
  const openSessionIds = new Set(sessionIds);
  const activePayments = payments.filter((payment) => openSessionIds.has(payment.cash_session_id));

  return {
    registers: registers.map((register) => ({ id: register.id, name: register.name })),
    sessions: cashSessions,
    orders: checkoutOrders,
    recentPayments,
    cashTotalMinor: activePayments.filter((payment) => payment.method === "cash").reduce((sum, payment) => sum + Number(payment.amount_minor), 0),
    cardTotalMinor: activePayments.filter((payment) => payment.method === "card").reduce((sum, payment) => sum + Number(payment.amount_minor), 0),
    refundTotalMinor: refunds.filter((refund) => openSessionIds.has(refund.cash_session_id)).reduce((sum, refund) => sum + Number(refund.amount_minor), 0),
  };
}
