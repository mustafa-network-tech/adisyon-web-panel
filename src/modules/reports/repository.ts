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
