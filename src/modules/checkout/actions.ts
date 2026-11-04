"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspacePermission } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { FinanceActionResult } from "@/modules/cash-register/types";
import { closeSessionSchema, movementSchema, openSessionSchema, paymentSchema, refundSchema } from "./validation";

function fail(code: string, message: string): FinanceActionResult { return { ok: false, code, message }; }
function mapError(message: string): FinanceActionResult {
  const messages: Record<string, string> = {
    cash_session_already_open: "Bu kasa için zaten açık bir vardiya var.",
    cash_session_not_open: "Kasa vardiyası açık değil.",
    cash_register_not_available: "Seçilen kasa kullanılamıyor.",
    order_not_payable: "Bu sipariş henüz tahsilata uygun değil.",
    payment_exceeds_outstanding: "Ödeme kalan hesap tutarını aşamaz.",
    allocation_exceeds_item_quantity: "Ürün bölme miktarı kalan adedi aşıyor.",
    allocation_total_mismatch: "Ürün tahsis toplamı ödeme tutarıyla eşleşmiyor.",
    refund_exceeds_payment: "İade toplamı ödeme tutarını aşamaz.",
    payment_not_refundable: "Ödeme iade için uygun değil.",
  };
  const code = Object.keys(messages).find((item) => message.includes(item));
  return fail(code || "finance_operation_failed", code ? messages[code] : "Finans işlemi tamamlanamadı.");
}
function refresh(tenant: string, branch: string) {
  revalidatePath(`/app/${tenant}/${branch}/kasa`);
  revalidatePath(`/app/${tenant}/${branch}/masalar`);
}

export async function openCashSessionAction(input: unknown): Promise<FinanceActionResult> {
  const values = openSessionSchema.safeParse(input);
  if (!values.success) return fail("invalid_input", "Kasa açılış bilgilerini kontrol edin.");
  const context = await requireWorkspacePermission(values.data.tenant, values.data.branch, ["cash.open"]);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("open_cash_session", { target_tenant_id: context.tenantId, target_branch_id: context.branchId, target_cash_register_id: values.data.registerId, target_opening_minor: values.data.openingMinor, target_idempotency_key: values.data.idempotencyKey });
  if (error) return mapError(error.message);
  refresh(values.data.tenant, values.data.branch);
  return { ok: true, message: "Kasa vardiyası açıldı." };
}

export async function recordOrderPaymentsAction(input: unknown): Promise<FinanceActionResult> {
  const values = paymentSchema.safeParse(input);
  if (!values.success) return fail("invalid_input", "Ödeme bilgilerini kontrol edin.");
  const context = await requireWorkspacePermission(values.data.tenant, values.data.branch, ["payments.create"]);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("record_order_payments", { target_tenant_id: context.tenantId, target_branch_id: context.branchId, target_order_id: values.data.orderId, target_cash_session_id: values.data.cashSessionId, target_payments: values.data.payments, target_idempotency_key: values.data.idempotencyKey });
  if (error) return mapError(error.message);
  refresh(values.data.tenant, values.data.branch);
  revalidatePath(`/app/${values.data.tenant}/${values.data.branch}/siparis/${values.data.orderId}`);
  return { ok: true, message: "Ödeme güvenle kaydedildi." };
}

export async function refundPaymentAction(input: unknown): Promise<FinanceActionResult> {
  const values = refundSchema.safeParse(input);
  if (!values.success) return fail("invalid_input", "İade bilgilerini kontrol edin.");
  const context = await requireWorkspacePermission(values.data.tenant, values.data.branch, ["payments.refund"]);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("refund_payment", { target_tenant_id: context.tenantId, target_branch_id: context.branchId, target_payment_id: values.data.paymentId, target_cash_session_id: values.data.cashSessionId, target_amount_minor: values.data.amountMinor, target_reason: values.data.reason, target_idempotency_key: values.data.idempotencyKey });
  if (error) return mapError(error.message);
  refresh(values.data.tenant, values.data.branch);
  return { ok: true, message: "İade kaydedildi." };
}

export async function recordCashMovementAction(input: unknown): Promise<FinanceActionResult> {
  const values = movementSchema.safeParse(input);
  if (!values.success) return fail("invalid_input", "Kasa hareketini kontrol edin.");
  const context = await requireWorkspacePermission(values.data.tenant, values.data.branch, ["payments.create"]);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("record_cash_movement", { target_tenant_id: context.tenantId, target_branch_id: context.branchId, target_cash_session_id: values.data.cashSessionId, target_movement_type: values.data.movementType, target_amount_minor: values.data.amountMinor, target_reason: values.data.reason, target_idempotency_key: values.data.idempotencyKey });
  if (error) return mapError(error.message);
  refresh(values.data.tenant, values.data.branch);
  return { ok: true, message: "Kasa hareketi kaydedildi." };
}

export async function closeCashSessionAction(input: unknown): Promise<FinanceActionResult> {
  const values = closeSessionSchema.safeParse(input);
  if (!values.success) return fail("invalid_input", "Kasa kapanış bilgilerini kontrol edin.");
  const context = await requireWorkspacePermission(values.data.tenant, values.data.branch, ["cash.close"]);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("close_cash_session", { target_tenant_id: context.tenantId, target_branch_id: context.branchId, target_cash_session_id: values.data.cashSessionId, target_closing_minor: values.data.closingMinor, target_idempotency_key: values.data.idempotencyKey });
  if (error) return mapError(error.message);
  refresh(values.data.tenant, values.data.branch);
  return { ok: true, message: "Kasa vardiyası kapatıldı." };
}
