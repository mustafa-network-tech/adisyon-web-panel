import type { Metadata } from "next";
import { KitchenBoard } from "@/modules/kitchen/components/kitchen-board";
import { requireWorkspacePermission } from "@/lib/auth/access";
import { hasAnyPermission, workspaceSections } from "@/lib/permissions";
import { AvailabilityPanel } from "@/modules/catalog/components/availability-panel";
import { getCatalogSnapshot } from "@/modules/catalog/repository";
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
  const canAvailability = hasAnyPermission(context.permissions, ["catalog.availability"]);
  const catalog = canAvailability ? await getCatalogSnapshot(context.tenantId, context.branchId) : null;
  return <><KitchenBoard tenant={tenant} branch={branch} branchId={context.branchId} canUpdate={hasAnyPermission(context.permissions, ["kitchen.update"])} branding={branding} {...kitchen} />{catalog && <div className="px-4 pb-8 sm:px-6 lg:px-8"><AvailabilityPanel tenant={tenant} branch={branch} products={catalog.products} /></div>}</>;
}
