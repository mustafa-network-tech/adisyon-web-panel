import type { Metadata } from "next";
import { KitchenBoard } from "@/modules/kitchen/components/kitchen-board";
import { requireWorkspacePermission } from "@/lib/auth/access";
import { hasAnyPermission, workspaceSections } from "@/lib/permissions";
import { getKitchenSnapshot } from "@/modules/kitchen/repository";

export const metadata: Metadata = { title: "Mutfak" };
export const dynamic = "force-dynamic";

export default async function KitchenPage({ params }: { params: Promise<{ tenant: string; branch: string }> }) {
  const { tenant, branch } = await params;
  const context = await requireWorkspacePermission(tenant, branch, workspaceSections.kitchen);
  const kitchen = await getKitchenSnapshot(context.tenantId, context.branchId);
  return <KitchenBoard tenant={tenant} branch={branch} branchId={context.branchId} canUpdate={hasAnyPermission(context.permissions, ["kitchen.update"])} {...kitchen} />;
}
