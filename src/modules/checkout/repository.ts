import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { optionLabel, type OptionKind } from "@/modules/catalog/options";
import type {
  CashSession,
  CheckoutOrder,
  CheckoutSnapshot,
} from "@/modules/cash-register/types";

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

const PAGE_SIZE = 500; // below the API row limit, so a page is never cut silently
const MAX_PAGES = 20;
const ID_CHUNK = 50; // keeps the request address short

function chunk<T>(values: T[], size = ID_CHUNK) {
  const groups: T[][] = [];
  for (let index = 0; index < values.length; index += size) groups.push(values.slice(index, index + size));
  return groups;
}

/** Reads every page of a query. If the data is bigger than expected it fails loudly instead of dropping rows. */
async function fetchAll<T>(build: (from: number, to: number) => Page<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { data, error } = await build(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) throw new Error("Kasa verileri Supabase üzerinden okunamadı.");
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
  throw new Error("Kasa verisi beklenenden büyük; sorgu kapsamı daraltılmalı.");
}

async function fetchChunked<T>(ids: string[], build: (idChunk: string[], from: number, to: number) => Page<T>): Promise<T[]> {
  const parts = await Promise.all(chunk(ids).map((idChunk) => fetchAll<T>((from, to) => build(idChunk, from, to))));
  return parts.flat();
}

/**
 * The cash screen shows the CURRENT work only: the open shifts and the bills waiting for payment. Everything it
 * reads is scoped to those (their orders, their payments, their cash movements), never to the whole history of
 * the branch; older figures belong to the reports.
 */
export async function getCheckoutSnapshot(
  tenantId: string,
  branchId: string,
): Promise<CheckoutSnapshot> {
  const supabase = await createSupabaseServerClient();
  const [registersResult, sessionsResult] = await Promise.all([
    supabase.from("cash_registers").select("id, name").eq("tenant_id", tenantId).eq("branch_id", branchId).eq("is_active", true).order("name"),
    supabase.from("cash_sessions").select("id, cash_register_id, opening_minor, opened_by, opened_at").eq("tenant_id", tenantId).eq("branch_id", branchId).eq("status", "open").order("opened_at"),
  ]);
  if (registersResult.error || sessionsResult.error) throw new Error("Kasa verileri Supabase üzerinden okunamadı.");
  const registers = registersResult.data || [];
  const sessions = sessionsResult.data || [];
  const sessionIds = sessions.map((session) => session.id);

  const orders = await fetchAll((from, to) =>
    supabase.from("orders").select("id, order_number, table_id, created_by, opened_at, total_minor, discount_minor, discount_reason")
      .eq("tenant_id", tenantId).eq("branch_id", branchId).in("status", ["ready", "served"]).order("opened_at").order("id").range(from, to));
  const orderIds = orders.map((order) => order.id);

  const [orderPayments, sessionPayments, items] = await Promise.all([
    fetchChunked(orderIds, (ids, from, to) => supabase.from("payments").select("id, order_id, cash_session_id, method, amount_minor").eq("tenant_id", tenantId).eq("branch_id", branchId).eq("status", "completed").in("order_id", ids).order("id").range(from, to)),
    fetchChunked(sessionIds, (ids, from, to) => supabase.from("payments").select("id, order_id, cash_session_id, method, amount_minor").eq("tenant_id", tenantId).eq("branch_id", branchId).eq("status", "completed").in("cash_session_id", ids).order("id").range(from, to)),
    fetchChunked(orderIds, (ids, from, to) => supabase.from("order_items").select("id, order_id, product_name, quantity, unit_price_minor, list_unit_price_minor, tax_rate, source").eq("tenant_id", tenantId).eq("branch_id", branchId).in("order_id", ids).order("created_at").order("id").range(from, to)),
  ]);
  const payments = [...new Map([...orderPayments, ...sessionPayments].map((payment) => [payment.id, payment])).values()];
  const paymentIds = payments.map((payment) => payment.id);

  const [allocations, refundsByPayment, refundsBySession, adjustmentsByOrder, adjustmentsBySession, movements, tablesResult, profilesResult, optionRows] = await Promise.all([
    fetchChunked(orderIds, (ids, from, to) => supabase.from("payment_allocations").select("payment_id, order_id, order_item_id, quantity").eq("tenant_id", tenantId).eq("branch_id", branchId).in("order_id", ids).order("order_item_id").order("payment_id").range(from, to)),
    // refunds belong to the past (the feature was removed) but still count in the balance of older bills
    fetchChunked(paymentIds, (ids, from, to) => supabase.from("payment_refunds").select("id, payment_id, cash_session_id, amount_minor").eq("tenant_id", tenantId).eq("branch_id", branchId).in("payment_id", ids).order("id").range(from, to)),
    fetchChunked(sessionIds, (ids, from, to) => supabase.from("payment_refunds").select("id, payment_id, cash_session_id, amount_minor").eq("tenant_id", tenantId).eq("branch_id", branchId).in("cash_session_id", ids).order("id").range(from, to)),
    fetchChunked(orderIds, (ids, from, to) => supabase.from("order_adjustments").select("id, order_id, cash_session_id, kind, amount_minor").eq("tenant_id", tenantId).eq("branch_id", branchId).in("order_id", ids).order("id").range(from, to)),
    fetchChunked(sessionIds, (ids, from, to) => supabase.from("order_adjustments").select("id, order_id, cash_session_id, kind, amount_minor").eq("tenant_id", tenantId).eq("branch_id", branchId).in("cash_session_id", ids).order("id").range(from, to)),
    fetchChunked(sessionIds, (ids, from, to) => supabase.from("cash_movements").select("id, cash_session_id, movement_type, amount_minor").eq("tenant_id", tenantId).in("cash_session_id", ids).order("id").range(from, to)),
    (async () => {
      const tableIds = [...new Set(orders.map((order) => order.table_id).filter(Boolean))] as string[];
      return { data: await fetchChunked(tableIds, (ids, from, to) => supabase.from("restaurant_tables").select("id, label").eq("tenant_id", tenantId).eq("branch_id", branchId).in("id", ids).order("id").range(from, to)) };
    })(),
    (async () => {
      const userIds = [...new Set([...orders.map((order) => order.created_by).filter(Boolean), ...sessions.map((session) => session.opened_by)])] as string[];
      return { data: await fetchChunked(userIds, (ids, from, to) => supabase.from("profiles").select("id, full_name").in("id", ids).order("id").range(from, to)) };
    })(),
    fetchChunked(items.map((item) => item.id), (ids, from, to) => supabase.from("order_item_options").select("id, order_item_id, kind, choice_name").eq("tenant_id", tenantId).eq("branch_id", branchId).in("order_item_id", ids).order("created_at").order("id").range(from, to)),
  ]);

  const optionsByItem = new Map<string, string[]>();
  for (const row of optionRows) optionsByItem.set(row.order_item_id as string, [...(optionsByItem.get(row.order_item_id as string) || []), optionLabel(row.kind as OptionKind, row.choice_name as string)]);
  const registerMap = new Map(registers.map((item) => [item.id, item.name]));
  const tableMap = new Map(tablesResult.data.map((item) => [item.id, item.label]));
  const profileMap = new Map(profilesResult.data.map((item) => [item.id, item.full_name]));

  const refundByPayment = new Map<string, number>();
  for (const refund of refundsByPayment) refundByPayment.set(refund.payment_id, (refundByPayment.get(refund.payment_id) || 0) + Number(refund.amount_minor));
  const adjustedByOrder = new Map<string, number>();
  for (const adjustment of adjustmentsByOrder) adjustedByOrder.set(adjustment.order_id, (adjustedByOrder.get(adjustment.order_id) || 0) + Number(adjustment.amount_minor));
  const allocatedByItem = new Map<string, number>();
  for (const allocation of allocations) allocatedByItem.set(allocation.order_item_id, (allocatedByItem.get(allocation.order_item_id) || 0) + allocation.quantity);
  const itemsByOrder = new Map<string, typeof items>();
  for (const item of items) itemsByOrder.set(item.order_id, [...(itemsByOrder.get(item.order_id) || []), item]);

  const checkoutOrders: CheckoutOrder[] = orders.flatMap((order) => {
    const paymentsOfOrder = payments.filter((payment) => payment.order_id === order.id);
    const paidMinor = paymentsOfOrder.reduce((sum, payment) => sum + Number(payment.amount_minor) - (refundByPayment.get(payment.id) || 0), 0);
    const adjustedMinor = adjustedByOrder.get(order.id) || 0;
    // the same arithmetic as record_order_payments: money + discount / promotion settle the original total
    const outstandingMinor = Number(order.total_minor) - paidMinor - adjustedMinor;
    if (outstandingMinor <= 0) return [];
    return [{
      id: order.id,
      orderNumber: Number(order.order_number),
      tableLabel: order.table_id ? tableMap.get(order.table_id) || "Masa" : "Paket",
      serverName: (order.created_by ? profileMap.get(order.created_by) : "Müşteri (QR)") || "Ekip üyesi",
      staffName: order.created_by ? profileMap.get(order.created_by) || "Ekip üyesi" : null,
      openedAt: order.opened_at,
      totalMinor: Number(order.total_minor),
      discountMinor: Number(order.discount_minor),
      discountReason: order.discount_reason,
      adjustedMinor,
      paidMinor,
      outstandingMinor,
      items: (itemsByOrder.get(order.id) || []).map((item) => ({ id: item.id, name: item.product_name, quantity: item.quantity, allocatedQuantity: allocatedByItem.get(item.id) || 0, unitPriceMinor: Number(item.unit_price_minor), options: optionsByItem.get(item.id) || [], taxRate: Number(item.tax_rate), source: item.source as "staff" | "qr", listUnitPriceMinor: item.list_unit_price_minor === null ? null : Number(item.list_unit_price_minor) })),
    }];
  });

  const cashSessions: CashSession[] = sessions.map((session) => {
    const cashPayments = sessionPayments.filter((payment) => payment.cash_session_id === session.id && payment.method === "cash");
    const cashPaid = cashPayments.reduce((sum, payment) => sum + Number(payment.amount_minor), 0);
    const cashRefunded = refundsBySession.filter((refund) => refund.cash_session_id === session.id && cashPayments.some((payment) => payment.id === refund.payment_id)).reduce((sum, refund) => sum + Number(refund.amount_minor), 0);
    const movementNet = movements.filter((movement) => movement.cash_session_id === session.id).reduce((sum, movement) => sum + (movement.movement_type === "income" ? Number(movement.amount_minor) : -Number(movement.amount_minor)), 0);
    return { id: session.id, cashRegisterId: session.cash_register_id, cashRegisterName: registerMap.get(session.cash_register_id) || "Kasa", openingMinor: Number(session.opening_minor), openedAt: session.opened_at, openedByName: profileMap.get(session.opened_by) || "Ekip üyesi", expectedMinor: Number(session.opening_minor) + cashPaid - cashRefunded + movementNet };
  });

  const sum = (rows: { amount_minor: number | string }[]) => rows.reduce((total, row) => total + Number(row.amount_minor), 0);
  return {
    registers: registers.map((register) => ({ id: register.id, name: register.name })),
    sessions: cashSessions,
    orders: checkoutOrders,
    // real money of the open shifts; a discount or promotion is NOT money and is shown apart
    cashTotalMinor: sum(sessionPayments.filter((payment) => payment.method === "cash")),
    cardTotalMinor: sum(sessionPayments.filter((payment) => payment.method === "card")),
    discountTotalMinor: sum(adjustmentsBySession.filter((adjustment) => adjustment.kind === "discount")),
    promotionTotalMinor: sum(adjustmentsBySession.filter((adjustment) => adjustment.kind === "promotion")),
  };
}
