import type { Metadata } from "next";
import { CheckoutPanel } from "@/modules/checkout/components/checkout-panel";
import { requireWorkspacePermission } from "@/lib/auth/access";
import { workspaceSections } from "@/lib/permissions";

export const metadata: Metadata = { title: "Kasa" };

export default async function CashRegisterPage({ params }: { params: Promise<{ tenant: string; branch: string }> }) {
  const { tenant, branch } = await params;
  await requireWorkspacePermission(tenant, branch, workspaceSections.checkout);
  return <CheckoutPanel />;
}
