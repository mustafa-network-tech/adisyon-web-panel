import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PlatformMember, SubscriptionStatus, TenantSummary } from "./types";

export type PlatformTenantSummary = TenantSummary & {
  code: string;
  slug: string;
  isActive: boolean;
  planCode: string;
  userLimit: number;
  branchLimit: number;
};

export type PlatformOverview = {
  tenants: PlatformTenantSummary[];
  tenantCount: number;
  branchCount: number;
  userCount: number;
  activeSubscriptionCount: number;
  trialCount: number;
};

type TenantRow = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
};

type SubscriptionRow = {
  tenant_id: string;
  plan_code: string;
  status: SubscriptionStatus;
  ends_at: string | null;
  user_limit: number;
  branch_limit: number;
};

export async function getPlatformOverview(
  search?: string,
): Promise<PlatformOverview> {
  const supabase = await createSupabaseServerClient();
  const tenantQuery = supabase
    .from("tenants")
    .select("id, name, slug, is_active")
    .order("created_at", { ascending: false });

  const [tenantsResult, branchesResult, membershipsResult, subscriptionsResult] =
    await Promise.all([
      tenantQuery,
      supabase.from("branches").select("id, tenant_id"),
      supabase.from("tenant_memberships").select("id, tenant_id"),
      supabase
        .from("subscriptions")
        .select("tenant_id, plan_code, status, ends_at, user_limit, branch_limit")
        .order("created_at", { ascending: false }),
    ]);

  const firstError = [
    tenantsResult.error,
    branchesResult.error,
    membershipsResult.error,
    subscriptionsResult.error,
  ].find(Boolean);

  if (firstError) {
    throw new Error("Platform verileri Supabase üzerinden okunamadı.");
  }

  const tenants = (tenantsResult.data || []) as TenantRow[];
  const branches = branchesResult.data || [];
  const memberships = membershipsResult.data || [];
  const subscriptions = (subscriptionsResult.data || []) as SubscriptionRow[];
  const latestSubscription = new Map<string, SubscriptionRow>();

  for (const subscription of subscriptions) {
    if (!latestSubscription.has(subscription.tenant_id)) {
      latestSubscription.set(subscription.tenant_id, subscription);
    }
  }

  const normalizedSearch = search?.trim().toLocaleLowerCase("tr-TR");
  const visibleTenants = normalizedSearch
    ? tenants.filter(
        (tenant) =>
          tenant.name.toLocaleLowerCase("tr-TR").includes(normalizedSearch) ||
          tenant.slug.toLocaleLowerCase("tr-TR").includes(normalizedSearch),
      )
    : tenants;
  const summaries = visibleTenants.map((tenant, index) => {
    const subscription = latestSubscription.get(tenant.id);

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      code: `MK-${String(index + 1).padStart(4, "0")}`,
      branches: branches.filter((branch) => branch.tenant_id === tenant.id).length,
      users: memberships.filter(
        (membership) => membership.tenant_id === tenant.id,
      ).length,
      subscriptionStatus: subscription?.status || "cancelled",
      expiresAt: subscription?.ends_at || "",
      isActive: tenant.is_active,
      planCode: subscription?.plan_code || "Tanımsız",
      userLimit: subscription?.user_limit ?? 5,
      branchLimit: subscription?.branch_limit ?? 1,
    } satisfies PlatformTenantSummary;
  });

  const currentSubscriptions = [...latestSubscription.values()];

  return {
    tenants: summaries,
    tenantCount: tenants.length,
    branchCount: branches.length,
    userCount: memberships.length,
    activeSubscriptionCount: currentSubscriptions.filter(
      (subscription) => subscription.status === "active",
    ).length,
    trialCount: currentSubscriptions.filter(
      (subscription) => subscription.status === "trial",
    ).length,
  };
}

export async function getPlatformMembers(): Promise<PlatformMember[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("platform_list_members");
  if (error) throw new Error("Üye listesi okunamadı.");
  return (data || []) as PlatformMember[];
}
