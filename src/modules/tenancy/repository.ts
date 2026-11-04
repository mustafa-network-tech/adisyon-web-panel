import "server-only";

import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { isPermission, type Permission } from "@/lib/permissions";

type SupabaseServerClient = Awaited<
  ReturnType<typeof createSupabaseServerClient>
>;

export type WorkspaceContext = {
  userId: string;
  userName: string;
  userRole: string;
  tenantId: string;
  tenantName: string;
  branchId: string;
  branchName: string;
  permissions: Permission[];
  supportMode: boolean;
  branches: Array<{ slug: string; name: string }>;
  tenantScope: boolean;
};

export async function resolveWorkspaceContext(
  supabase: SupabaseServerClient,
  identity: { userId: string; email: string | null },
  tenantSlug: string,
  branchSlug: string,
): Promise<WorkspaceContext | null> {
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name")
    .eq("slug", tenantSlug)
    .eq("is_active", true)
    .maybeSingle();

  if (!tenant) return null;

  const { data: branch } = await supabase
    .from("branches")
    .select("id, name")
    .eq("tenant_id", tenant.id)
    .eq("slug", branchSlug)
    .eq("is_active", true)
    .maybeSingle();

  if (!branch) return null;

  const [{ data: membership }, { data: profile }] = await Promise.all([
    supabase
      .from("tenant_memberships")
      .select("id")
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

  let supportMode = false;
  let permissions: Permission[] = [];
  let userRole = "Ekip üyesi";
  let tenantScope = false;

  if (membership) {
    const [{ data: branchAssignment }, { data: roleLinks }, { data: grantLinks }] =
      await Promise.all([
        supabase
          .from("membership_branches")
          .select("branch_id")
          .eq("tenant_id", tenant.id)
          .eq("membership_id", membership.id)
          .eq("branch_id", branch.id)
          .maybeSingle(),
        supabase
          .from("membership_roles")
          .select("role_id")
          .eq("tenant_id", tenant.id)
          .eq("membership_id", membership.id),
        supabase
          .from("membership_permission_grants")
          .select("permission_id")
          .eq("tenant_id", tenant.id)
          .eq("membership_id", membership.id),
      ]);
    const roleIds = [...new Set((roleLinks || []).map((link) => link.role_id))];

    const [{ data: roles }, { data: permissionLinks }] = roleIds.length
      ? await Promise.all([
          supabase
            .from("roles")
            .select("id, name, scope")
            .eq("tenant_id", tenant.id)
            .in("id", roleIds),
          supabase
            .from("role_permissions")
            .select("permission_id")
            .eq("tenant_id", tenant.id)
            .in("role_id", roleIds),
        ])
      : [{ data: [] }, { data: [] }];

    // Tenant-scope roles (owner / tenant admin) reach every active branch.
    const hasTenantScope = (roles || []).some((role) => role.scope === "tenant");
    if (!branchAssignment && !hasTenantScope) return null;
    tenantScope = hasTenantScope;

    const permissionIds = [
      ...new Set([
        ...(permissionLinks || []).map((link) => link.permission_id),
        ...(grantLinks || []).map((link) => link.permission_id),
      ]),
    ];
    userRole = (roles || []).map((role) => role.name).join(" / ") || userRole;

    if (permissionIds.length > 0) {
      const { data: permissionRows } = await supabase
        .from("permissions")
        .select("code")
        .in("id", permissionIds);
      permissions = (permissionRows || [])
        .map((row) => row.code)
        .filter(isPermission);
    }
  } else {
    const { data: supportSession } = await supabase
      .from("platform_support_sessions")
      .select("id")
      .eq("admin_user_id", identity.userId)
      .eq("tenant_id", tenant.id)
      .eq("branch_id", branch.id)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .limit(1)
      .maybeSingle();

    if (!supportSession) return null;

    supportMode = true;
    userRole = "Platform desteği";
    permissions = ["tables.read", "kitchen.read", "reports.read"];
  }

  const { error: auditError } = await supabase.rpc("record_tenant_context", {
    target_tenant_id: tenant.id,
    target_branch_id: branch.id,
  });

  if (auditError) return null;

  const { data: branchRows } = await supabase
    .from("branches")
    .select("slug, name")
    .eq("tenant_id", tenant.id)
    .eq("is_active", true)
    .order("name");

  return {
    userId: identity.userId,
    userName: profile?.full_name || identity.email || "Kullanıcı",
    userRole,
    tenantId: tenant.id,
    tenantName: tenant.name,
    branchId: branch.id,
    branchName: branch.name,
    permissions,
    supportMode,
    tenantScope,
    branches: (branchRows || []).map((item) => ({ slug: item.slug, name: item.name })),
  };
}
