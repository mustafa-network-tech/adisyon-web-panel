import type { Metadata } from "next";
import { KitchenBoard } from "@/modules/kitchen/components/kitchen-board";
import { requireWorkspacePermission } from "@/lib/auth/access";
import { hasAnyPermission, workspaceSections } from "@/lib/permissions";
import { getKitchenSnapshot } from "@/modules/kitchen/repository";
import { getReceiptBranding } from "@/modules/receipts/repository";

export const metadata: Metadata = { title: "Mutfak" };
export const dynamic = "force-dynamic";

export default async function KitchenPage({ params }: { params: Promise<{ tenant: string; branch: string }> }) {
  const { tenant, branch } = await params;
  const context = await requireWorkspacePermission(tenant, branch, workspaceSections.kitchen);
  const [kitchen, branding] = await Promise.all([
    getKitchenSnapshot(context.tenantId, context.branchId),
    getReceiptBranding(context),
  ]);
  return <KitchenBoard tenant={tenant} branch={branch} branchId={context.branchId} canUpdate={hasAnyPermission(context.permissions, ["kitchen.update"])} branding={branding} {...kitchen} />;
}
