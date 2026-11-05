import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireWorkspacePermission } from "@/lib/auth/access";
import { workspaceSections } from "@/lib/permissions";
import { getCatalogSnapshot } from "@/modules/catalog/repository";
import { OrderEditor } from "@/modules/orders/components/order-editor";
import { getOrderSnapshot } from "@/modules/orders/repository";
import { getReceiptBranding } from "@/modules/receipts/repository";

export const metadata: Metadata = { title: "Sipariş" };
export const dynamic = "force-dynamic";

export default async function OrderPage({
  params,
}: {
  params: Promise<{ tenant: string; branch: string; orderId: string }>;
}) {
  const { tenant, branch, orderId } = await params;
  const context = await requireWorkspacePermission(
    tenant,
    branch,
    workspaceSections.orders,
  );
  const [order, catalog, branding] = await Promise.all([
    getOrderSnapshot(context.tenantId, context.branchId, orderId),
    getCatalogSnapshot(context.tenantId, context.branchId),
    getReceiptBranding(context),
  ]);
  if (!order) notFound();

  const activeCategoryIds = new Set(
    catalog.categories
      .filter((category) => category.isActive)
      .map((category) => category.id),
  );
  const products = catalog.products.filter(
    (product) => product.isActive && activeCategoryIds.has(product.categoryId),
  );

  return (
    <section className="p-4 sm:p-6 lg:p-8">
      <Link
        href={`/app/${tenant}/${branch}/masalar`}
        className="mb-6 inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#dce3df] bg-white px-4 text-sm font-bold"
      >
        <ArrowLeft size={17} /> Masalara dön
      </Link>
      <OrderEditor
        tenant={tenant}
        branch={branch}
        branchId={context.branchId}
        order={order}
        products={products}
        branding={branding}
      />
    </section>
  );
}
