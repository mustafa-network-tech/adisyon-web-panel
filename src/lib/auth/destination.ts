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

  return tenant && branch ? `/app/${tenant.slug}/${branch.slug}/masalar` : null;
}
