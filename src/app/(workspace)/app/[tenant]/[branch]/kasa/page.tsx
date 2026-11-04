import type { Metadata } from "next";
import { CheckoutPanel } from "@/modules/checkout/components/checkout-panel";
import { requireWorkspacePermission } from "@/lib/auth/access";
import { hasAnyPermission, workspaceSections } from "@/lib/permissions";
import { getCheckoutSnapshot } from "@/modules/checkout/repository";

export const metadata: Metadata = { title: "Kasa" };
export const dynamic = "force-dynamic";

export default async function CashRegisterPage({ params }: { params: Promise<{ tenant: string; branch: string }> }) {
  const { tenant, branch } = await params;
  const context = await requireWorkspacePermission(tenant, branch, workspaceSections.checkout);
  const checkout = await getCheckoutSnapshot(context.tenantId, context.branchId);
  return <CheckoutPanel tenant={tenant} branch={branch} branchId={context.branchId} canOpen={hasAnyPermission(context.permissions, ["cash.open"])} canClose={hasAnyPermission(context.permissions, ["cash.close"])} canPay={hasAnyPermission(context.permissions, ["payments.create"])} canRefund={hasAnyPermission(context.permissions, ["payments.refund"])} {...checkout} />;
}
