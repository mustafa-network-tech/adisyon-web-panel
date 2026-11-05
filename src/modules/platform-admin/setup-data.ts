import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapOnboarding, onboardingColumns } from "@/modules/onboarding/repository";
import type { OnboardingState, SubscriptionLite } from "@/modules/onboarding/status";

export type SetupRequestSummary = OnboardingState & { tenantName: string; requestedAt: string | null; updatedAt: string };

type Row = Parameters<typeof mapOnboarding>[0] & { requested_at: string | null; updated_at: string };

/** Businesses that asked MK Digital Systems for setup help, newest first. */
export async function getSetupRequests(): Promise<SetupRequestSummary[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("tenant_onboarding")
    .select(`${onboardingColumns}, requested_at, updated_at`)
    .eq("setup_method", "assisted")
    .order("requested_at", { ascending: false, nullsFirst: false });
  const rows = (data ?? []) as unknown as Row[];
  if (rows.length === 0) return [];
  const { data: tenants } = await supabase.from("tenants").select("id, name").in("id", rows.map((row) => row.tenant_id));
  const names = new Map((tenants ?? []).map((tenant) => [tenant.id as string, tenant.name as string]));
  return rows.map((row) => ({
    ...mapOnboarding(row),
    tenantName: names.get(row.tenant_id) ?? "İşletme",
    requestedAt: row.requested_at,
    updatedAt: row.updated_at,
  }));
}

export type SetupDetail = {
  onboarding: OnboardingState;
  tenantName: string;
  tenantSlug: string;
  subscription: SubscriptionLite;
};

export async function getSetupDetail(tenantId: string): Promise<SetupDetail | null> {
  const supabase = await createSupabaseServerClient();
  const [{ data: row }, { data: tenant }, { data: subscription }] = await Promise.all([
    supabase.from("tenant_onboarding").select(onboardingColumns).eq("tenant_id", tenantId).maybeSingle(),
    supabase.from("tenants").select("name, slug").eq("id", tenantId).maybeSingle(),
    supabase.from("subscriptions").select("status, ends_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!row || !tenant) return null;
  return {
    onboarding: mapOnboarding(row as unknown as Parameters<typeof mapOnboarding>[0]),
    tenantName: tenant.name as string,
    tenantSlug: tenant.slug as string,
    subscription: subscription ? { status: subscription.status as NonNullable<SubscriptionLite>["status"], endsAt: (subscription.ends_at as string | null) ?? null } : null,
  };
}
