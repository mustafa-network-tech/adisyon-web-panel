import { AppShell } from "@/components/app-shell";

export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ tenant: string; branch: string }> }) {
  const { tenant, branch } = await params;
  return <AppShell tenant={tenant} branch={branch}>{children}</AppShell>;
}
