import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { setupSteps, type OnboardingState, type Readiness, type SetupMethod, type SetupStatus, type SetupStep } from "./status";

type OnboardingRow = {
  tenant_id: string;
  branch_id: string;
  selected_plan: "START" | "PRO" | "MULTI";
  setup_method: SetupMethod | null;
  status: SetupStatus;
  current_step: number;
  completed_steps: string[] | null;
  request_payload: Record<string, unknown> | null;
  admin_note: string | null;
  trial_started_at: string | null;
};

export const onboardingColumns =
  "tenant_id, branch_id, selected_plan, setup_method, status, current_step, completed_steps, request_payload, admin_note, trial_started_at";

export function mapOnboarding(row: OnboardingRow): OnboardingState {
  const payload = row.request_payload ?? {};
  const text = (key: string) => (typeof payload[key] === "string" ? (payload[key] as string) : "");
  return {
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    selectedPlan: row.selected_plan,
    method: row.setup_method,
    status: row.status,
    currentStep: row.current_step,
    completedSteps: (row.completed_steps ?? []).filter((step): step is SetupStep => setupSteps.some((item) => item.id === step)),
    requestPayload: { details: text("details"), areas: text("areas"), tables: text("tables"), stations: text("stations"), menu: text("menu"), notes: text("notes") },
    adminNote: row.admin_note,
    trialStartedAt: row.trial_started_at,
  };
}

/** Setup progress of one business; null for businesses created before the setup flow existed. */
export async function getOnboarding(tenantId: string): Promise<OnboardingState | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("tenant_onboarding").select(onboardingColumns).eq("tenant_id", tenantId).maybeSingle();
  return data ? mapOnboarding(data as OnboardingRow) : null;
}

/** Which of the four steps already have data in the branch. */
export async function getReadiness(tenantId: string): Promise<Readiness | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_setup_readiness", { target_tenant_id: tenantId });
  if (error || !data || typeof data !== "object") return null;
  const value = data as Record<string, unknown>;
  return { areas: value.areas === true, tables: value.tables === true, stations: value.stations === true, menu: value.menu === true };
}

/** True when the signed-in user is an active owner of the business. */
export async function isTenantOwner(tenantId: string, userId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data: membership } = await supabase
    .from("tenant_memberships")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) return false;
  const { data: links } = await supabase.from("membership_roles").select("role_id").eq("tenant_id", tenantId).eq("membership_id", membership.id);
  const roleIds = (links ?? []).map((link) => link.role_id as string);
  if (roleIds.length === 0) return false;
  const { data: roles } = await supabase.from("roles").select("id").eq("tenant_id", tenantId).eq("code", "owner").in("id", roleIds);
  return (roles ?? []).length > 0;
}
