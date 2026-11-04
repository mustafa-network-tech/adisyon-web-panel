import type { Metadata } from "next";
import { KitchenBoard } from "@/modules/kitchen/components/kitchen-board";
import { requireWorkspacePermission } from "@/lib/auth/access";
import { workspaceSections } from "@/lib/permissions";

export const metadata: Metadata = { title: "Mutfak" };

export default async function KitchenPage({ params }: { params: Promise<{ tenant: string; branch: string }> }) {
  const { tenant, branch } = await params;
  await requireWorkspacePermission(tenant, branch, workspaceSections.kitchen);
  return <KitchenBoard />;
}
