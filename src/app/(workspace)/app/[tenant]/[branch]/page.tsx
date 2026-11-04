import { redirect } from "next/navigation";
import { requireWorkspaceAccess } from "@/lib/auth/access";
import { getWorkspaceHomeSegment } from "@/lib/permissions";

export default async function WorkspacePage({ params }: { params: Promise<{ tenant: string; branch: string }> }) {
  const { tenant, branch } = await params;
  const context = await requireWorkspaceAccess(tenant, branch);
  const segment = getWorkspaceHomeSegment(context.permissions);

  if (!segment) redirect("/giris?error=workspace-access");
  redirect(`/app/${tenant}/${branch}/${segment}`);
}
