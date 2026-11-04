import "server-only";

import { redirect } from "next/navigation";
import {
  hasAnyPermission,
  type Permission,
} from "@/lib/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveWorkspaceContext } from "@/modules/tenancy/repository";

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
  const context = await resolveWorkspaceContext(
    supabase,
    identity,
    tenantSlug,
    branchSlug,
  );

  if (!context) redirect("/giris?error=workspace-access");
  return context;
}

export async function requireWorkspacePermission(
  tenantSlug: string,
  branchSlug: string,
  required: readonly Permission[],
) {
  const context = await requireWorkspaceAccess(tenantSlug, branchSlug);

  if (!hasAnyPermission(context.permissions, required)) {
    redirect(`/app/${tenantSlug}/${branchSlug}`);
  }

  return context;
}
