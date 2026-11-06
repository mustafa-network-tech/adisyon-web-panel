import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SalesReport } from "./types";

export async function getSalesReport(input: {
  tenantId: string;
  branchId: string;
  from: string;
  to: string;
}): Promise<{ report: SalesReport | null; error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("sales_report", {
    target_tenant_id: input.tenantId,
    target_branch_id: input.branchId,
    range_start: input.from,
    range_end: input.to,
  });
  if (error) {
    if (error.message.includes("report_history_denied")) return { report: null, error: "Geçmiş günlerin raporlarını görme yetkiniz yok. Yalnızca bugünü görüntüleyebilirsiniz." };
    if (error.message.includes("invalid_report_range")) return { report: null, error: "Tarih aralığı en fazla 93 gün olabilir." };
    return { report: null, error: "Rapor hazırlanamadı." };
  }
  return { report: data as SalesReport, error: null };
}

export type DiscountAuditRow = {
  adjustmentId: string;
  createdAt: string;
  kind: "discount" | "promotion";
  amountMinor: number;
  reason: string | null;
  orderId: string;
  orderNumber: string;
  tableLabel: string | null;
  originalTotalMinor: number;
  cashMinor: number;
  cardMinor: number;
  cashierName: string;
  branchName: string;
  tenantName: string;
};

/** Every discount / promotion given at the cash desk in the range (immutable records; rows are never edited). */
export async function getDiscountAudit(input: { tenantId: string; branchId: string; from: string; to: string }): Promise<DiscountAuditRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("discount_audit", {
    target_tenant_id: input.tenantId,
    target_branch_id: input.branchId,
    range_start: input.from,
    range_end: input.to,
  });
  if (error || !Array.isArray(data)) return [];
  return data as DiscountAuditRow[];
}
