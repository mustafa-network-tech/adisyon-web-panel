import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  JoinRequest,
  MembershipStatus,
  TeamBranch,
  TeamMember,
  TeamRole,
  TeamSnapshot,
  TenantConfiguration,
} from "./management-types";

type SettingsRow = {
  brand_name: string;
  primary_color: string;
  order_number_prefix: string;
  receipt_footer: string | null;
};

export async function getTenantConfiguration(
  tenantId: string,
  branchId: string,
): Promise<TenantConfiguration> {
  const supabase = await createSupabaseServerClient();
  const [tenantResult, branchResult, settingsResult] = await Promise.all([
    supabase.from("tenants").select("name, legal_name").eq("id", tenantId).single(),
    supabase.from("branches").select("name").eq("tenant_id", tenantId).eq("id", branchId).single(),
    supabase
      .from("tenant_settings")
      .select("brand_name, primary_color, order_number_prefix, receipt_footer")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
  ]);

  const firstError = [tenantResult.error, branchResult.error, settingsResult.error].find(Boolean);
  if (firstError || !tenantResult.data || !branchResult.data) {
    throw new Error("İşletme ayarları okunamadı.");
  }
  const settings = settingsResult.data as SettingsRow | null;
  return {
    tenantName: tenantResult.data.name,
    legalName: tenantResult.data.legal_name || "",
    branchName: branchResult.data.name,
    brandName: settings?.brand_name || tenantResult.data.name,
    primaryColor: settings?.primary_color || "#e8623a",
    orderNumberPrefix: settings?.order_number_prefix || "MK",
    receiptFooter: settings?.receipt_footer || "",
  };
}

type MembershipRow = { id: string; user_id: string; status: MembershipStatus };

export async function getTeamSnapshot(tenantId: string, canGrantExtras = false): Promise<TeamSnapshot> {
  const supabase = await createSupabaseServerClient();
  const [branchesResult, rolesResult, membershipsResult, branchLinksResult, roleLinksResult, joinRequestsResult, joinCodeResult, grantsResult, stationLinksResult, stationsResult, permissionsResult] =
    await Promise.all([
      supabase.from("branches").select("id, name").eq("tenant_id", tenantId).order("name"),
      supabase.from("roles").select("id, code, name, scope").eq("tenant_id", tenantId).order("name"),
      supabase.from("tenant_memberships").select("id, user_id, status").eq("tenant_id", tenantId).order("created_at"),
      supabase.from("membership_branches").select("membership_id, branch_id").eq("tenant_id", tenantId),
      supabase.from("membership_roles").select("membership_id, role_id").eq("tenant_id", tenantId),
      supabase.rpc("list_join_requests", { target_tenant_id: tenantId }),
      canGrantExtras ? supabase.rpc("get_join_code", { target_tenant_id: tenantId }) : Promise.resolve({ data: null, error: null }),
      supabase.from("membership_permission_grants").select("membership_id, permission_id").eq("tenant_id", tenantId),
      supabase.from("membership_kitchen_stations").select("membership_id, station_id").eq("tenant_id", tenantId),
      supabase.from("kitchen_stations").select("id, name, branch_id").eq("tenant_id", tenantId).eq("is_active", true).order("name"),
      supabase.from("permissions").select("id, code"),
    ]);
  const firstError = [branchesResult.error, rolesResult.error, membershipsResult.error, branchLinksResult.error, roleLinksResult.error, joinRequestsResult.error, joinCodeResult.error, grantsResult.error, stationLinksResult.error, stationsResult.error, permissionsResult.error].find(Boolean);
  if (firstError) throw new Error("Ekip ve rol bilgileri okunamadı.");

  const branches = (branchesResult.data || []) as TeamBranch[];
  const roles = (rolesResult.data || []) as TeamRole[];
  const memberships = (membershipsResult.data || []) as MembershipRow[];
  const userIds = memberships.map((item) => item.user_id);
  const profilesResult = userIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", userIds)
    : { data: [], error: null };
  if (profilesResult.error) throw new Error("Kullanıcı profilleri okunamadı.");

  const names = new Map((profilesResult.data || []).map((item) => [item.id, item.full_name]));
  const branchNames = new Map(branches.map((item) => [item.id, item.name]));
  const permissionCodeById = new Map((permissionsResult.data || []).map((item) => [item.id as string, item.code as string]));
  const stations = (stationsResult.data || []).map((item) => ({ id: item.id as string, name: item.name as string, branchName: branchNames.get(item.branch_id as string) || "Şube" }));
  const members: TeamMember[] = memberships.map((item) => ({
    id: item.id,
    userId: item.user_id,
    fullName: names.get(item.user_id) || `Kullanıcı ${item.user_id.slice(0, 8)}`,
    status: item.status,
    branchIds: (branchLinksResult.data || []).filter((link) => link.membership_id === item.id).map((link) => link.branch_id),
    roleIds: (roleLinksResult.data || []).filter((link) => link.membership_id === item.id).map((link) => link.role_id),
    permissionCodes: (grantsResult.data || []).filter((link) => link.membership_id === item.id).map((link) => permissionCodeById.get(link.permission_id)).filter((code): code is string => Boolean(code)),
    stationIds: (stationLinksResult.data || []).filter((link) => link.membership_id === item.id).map((link) => link.station_id),
  }));
  const joinRequests: JoinRequest[] = ((joinRequestsResult.data || []) as JoinRequest[]).map((item) => ({
    id: item.id,
    fullName: item.fullName,
    email: item.email,
    createdAt: item.createdAt,
  }));
  const joinCode = typeof joinCodeResult.data === "string" ? joinCodeResult.data : null;
  return { branches, roles, members, joinRequests, joinCode, stations, canGrantExtras };
}
