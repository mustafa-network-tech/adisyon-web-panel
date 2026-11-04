import type { Metadata } from "next";
import { TableBoard } from "@/modules/tables/components/table-board";
import { requireWorkspacePermission } from "@/lib/auth/access";
import { workspaceSections } from "@/lib/permissions";
import { getCatalogSnapshot } from "@/modules/catalog/repository";
import { getDiningSnapshot } from "@/modules/tables/repository";

export const metadata: Metadata = { title: "Masalar" };

export default async function TablesPage({ params }: { params: Promise<{ tenant: string; branch: string }> }) {
  const { tenant, branch } = await params;
  const context = await requireWorkspacePermission(tenant, branch, workspaceSections.tables);
  const [dining, catalog] = await Promise.all([
    getDiningSnapshot(context.tenantId, context.branchId),
    getCatalogSnapshot(context.tenantId, context.branchId),
  ]);
  const activeCategoryIds = new Set(catalog.categories.filter((category) => category.isActive).map((category) => category.id));
  const products = catalog.products.filter((product) => activeCategoryIds.has(product.categoryId));

  return <TableBoard tenant={tenant} branch={branch} branchId={context.branchId} areas={dining.areas} tables={dining.tables} products={products} />;
}
