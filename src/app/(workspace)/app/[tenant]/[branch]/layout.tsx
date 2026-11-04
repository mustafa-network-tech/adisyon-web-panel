import { AppShell } from "@/components/app-shell";
import { requireWorkspaceAccess } from "@/lib/auth/access";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ tenant: string; branch: string }> }) {
  const { tenant, branch } = await params;
  const context = await requireWorkspaceAccess(tenant, branch);

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
    >
      {children}
    </AppShell>
  );
}
