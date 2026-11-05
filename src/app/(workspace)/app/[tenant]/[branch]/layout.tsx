import { AppShell } from "@/components/app-shell";
import { requireWorkspaceAccess } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPlanUsage } from "@/modules/plan/repository";
import { resolveTheme } from "@/modules/theme/themes";
import { daysLeft } from "@/modules/plan/usage";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ tenant: string; branch: string }> }) {
  const { tenant, branch } = await params;
  const context = await requireWorkspaceAccess(tenant, branch);
  const supabase = await createSupabaseServerClient();
  const [usage, settings] = await Promise.all([
    getPlanUsage(context.tenantId, context.branchId),
    supabase.from("tenant_settings").select("theme").eq("tenant_id", context.tenantId).maybeSingle(),
  ]);
  const theme = resolveTheme(settings.data?.theme);
  const readOnly = usage !== null && !usage.writable;
  const trialDaysLeft = usage?.status === "trial" && !readOnly ? daysLeft(usage.endsAt) : null;

  return (
    <AppShell
      tenant={tenant}
      branch={branch}
      tenantName={context.tenantName}
      branchName={context.branchName}
      userName={context.userName}
      userRole={context.userRole}
      permissions={context.permissions}
      supportMode={context.supportMode}
      branches={context.branches}
      userId={context.userId}
      branchId={context.branchId}
      trialDaysLeft={trialDaysLeft}
      readOnlyStatus={readOnly ? usage?.status ?? "trial" : null}
      theme={theme}
    >
      {children}
    </AppShell>
  );
}
