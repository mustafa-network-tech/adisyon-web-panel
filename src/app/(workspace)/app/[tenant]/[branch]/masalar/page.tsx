import type { Metadata } from "next";
import { TableBoard } from "@/modules/tables/components/table-board";
import { requireWorkspacePermission } from "@/lib/auth/access";
import { workspaceSections } from "@/lib/permissions";

export const metadata: Metadata = { title: "Masalar" };

export default async function TablesPage({ params }: { params: Promise<{ tenant: string; branch: string }> }) {
  const { tenant, branch } = await params;
  await requireWorkspacePermission(tenant, branch, workspaceSections.tables);
  return <TableBoard />;
}
