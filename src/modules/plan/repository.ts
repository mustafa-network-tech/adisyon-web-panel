import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PlanUsage } from "./usage";

/** What the current plan allows and what the business already uses; null when it cannot be read. */
export async function getPlanUsage(tenantId: string, branchId: string): Promise<PlanUsage | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_plan_usage", {
    target_tenant_id: tenantId,
    target_branch_id: branchId,
  });
  if (error || !data || typeof data !== "object") return null;
  const value = data as Record<string, unknown>;
  const number = (item: unknown) => (typeof item === "number" ? item : null);
  return {
    planCode: typeof value.planCode === "string" ? value.planCode : null,
    status: (value.status as PlanUsage["status"]) ?? null,
    endsAt: typeof value.endsAt === "string" ? value.endsAt : null,
    userLimit: number(value.userLimit),
    branchLimit: number(value.branchLimit),
    tableLimit: number(value.tableLimit),
    stationLimit: number(value.stationLimit),
    tablesUsed: number(value.tablesUsed) ?? 0,
    stationsUsed: number(value.stationsUsed) ?? 0,
    // Older databases do not report it; treat that as writable.
    writable: value.writable !== false,
    setupPending: value.setupPending === true,
  };
}
