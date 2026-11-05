import { AppShell } from "@/components/app-shell";
import { requireWorkspaceAccess } from "@/lib/auth/access";
import { getPlanUsage } from "@/modules/plan/repository";
import { daysLeft } from "@/modules/plan/usage";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ tenant: string; branch: string }> }) {
  const { tenant, branch } = await params;
  const context = await requireWorkspaceAccess(tenant, branch);
  const usage = await getPlanUsage(context.tenantId, context.branchId);
  const trialDaysLeft = usage?.status === "trial" ? daysLeft(usage.endsAt) : null;

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
    >
      {children}
    </AppShell>
  );
}
