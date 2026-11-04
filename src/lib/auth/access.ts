import "server-only";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type VerifiedIdentity = {
  userId: string;
  email: string | null;
};

async function getVerifiedIdentity(): Promise<VerifiedIdentity | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const subject = claims?.sub;

  if (error || !claims || typeof subject !== "string") return null;

  return {
    userId: subject,
    email: typeof claims.email === "string" ? claims.email : null,
  };
}

export async function requireAuthenticatedUser(returnTo: string) {
  const identity = await getVerifiedIdentity();

  if (!identity) {
    redirect(`/giris?next=${encodeURIComponent(returnTo)}`);
  }

  return identity;
}

export async function requirePlatformAdmin() {
  const identity = await requireAuthenticatedUser("/mk-admin");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", identity.userId)
    .maybeSingle();

  if (error || !data) {
    redirect("/giris?error=platform-access");
  }

  return identity;
}

export async function requireWorkspaceAccess(
  tenantSlug: string,
  branchSlug: string,
) {
  const returnTo = `/app/${tenantSlug}/${branchSlug}`;
  const identity = await requireAuthenticatedUser(returnTo);
  const supabase = await createSupabaseServerClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name, slug")
    .eq("slug", tenantSlug)
    .eq("is_active", true)
    .maybeSingle();

  if (!tenant) redirect("/giris?error=workspace-access");

  const [{ data: branch }, { data: membership }, { data: profile }] =
    await Promise.all([
      supabase
        .from("branches")
        .select("id, name, slug")
        .eq("tenant_id", tenant.id)
        .eq("slug", branchSlug)
        .eq("is_active", true)
        .maybeSingle(),
      supabase
        .from("tenant_memberships")
        .select("id, status")
        .eq("tenant_id", tenant.id)
        .eq("user_id", identity.userId)
        .eq("status", "active")
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("full_name")
        .eq("id", identity.userId)
        .maybeSingle(),
    ]);

  if (!branch || !membership) redirect("/giris?error=workspace-access");

  return {
    userId: identity.userId,
    userName: profile?.full_name || identity.email || "Kullanıcı",
    userRole: "Ekip üyesi",
    tenantId: tenant.id,
    tenantName: tenant.name,
    branchId: branch.id,
    branchName: branch.name,
  };
}
