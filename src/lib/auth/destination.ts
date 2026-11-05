import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Where a signed-in user lands by default; null when they have no business. */
export async function resolveDefaultDestination(userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: platformAdmin } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (platformAdmin) return "/mk-admin";

  const { data: membership } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!membership) return null;

  const [{ data: tenant }, { data: branch }] = await Promise.all([
    supabase
      .from("tenants")
      .select("slug")
      .eq("id", membership.tenant_id)
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("branches")
      .select("slug")
      .eq("tenant_id", membership.tenant_id)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!tenant || !branch) return null;

  // A business that has not started its trial yet continues with the setup.
  const { data: onboarding } = await supabase
    .from("tenant_onboarding")
    .select("trial_started_at")
    .eq("tenant_id", membership.tenant_id)
    .maybeSingle();
  if (onboarding && !onboarding.trial_started_at) return `/app/${tenant.slug}/${branch.slug}/kurulum`;

  // An ended trial sends the owner to the package activation page (data stays).
  if (onboarding?.trial_started_at) {
    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("status, ends_at")
      .eq("tenant_id", membership.tenant_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (subscription && subscription.status === "trial" && subscription.ends_at && new Date(subscription.ends_at) <= new Date()) {
      return `/app/${tenant.slug}/${branch.slug}/paket`;
    }
  }

  return `/app/${tenant.slug}/${branch.slug}/masalar`;
}
