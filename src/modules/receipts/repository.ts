import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TenantContext } from "@/modules/tenancy/types";
import type { ReceiptBranding } from "./types";

/** Brand name and footer shown on printed receipts (Settings → İşletme). */
export async function getReceiptBranding(
  context: Pick<TenantContext, "tenantId" | "tenantName" | "branchName">,
): Promise<ReceiptBranding> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("tenant_settings")
    .select("brand_name, receipt_footer")
    .eq("tenant_id", context.tenantId)
    .maybeSingle();

  return {
    brandName: data?.brand_name || context.tenantName,
    branchName: context.branchName,
    footer: data?.receipt_footer || null,
  };
}
