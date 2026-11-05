import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireWorkspacePermission } from "@/lib/auth/access";
import { hasAnyPermission } from "@/lib/permissions";
import { getCatalogSnapshot } from "@/modules/catalog/repository";
import { CatalogManager } from "@/modules/catalog/components/catalog-manager";

export const metadata: Metadata = { title: "Menü yönetimi" };
export const dynamic = "force-dynamic";

export default async function MenuSettingsPage({ params }: { params: Promise<{ tenant: string; branch: string }> }) {
  const { tenant, branch } = await params;
  const context = await requireWorkspacePermission(tenant, branch, ["catalog.manage"]);
  const catalog = await getCatalogSnapshot(context.tenantId, context.branchId);

  return <section className="p-4 sm:p-6 lg:p-8"><Link href={`/app/${tenant}/${branch}/ayarlar`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#dce3df] bg-white px-4 text-sm font-bold"><ArrowLeft size={16} /> Ayarlara dön</Link><div className="mb-7 mt-6"><p className="text-xs font-black uppercase tracking-[0.16em] text-[#e8623a]">Katalog</p><h1 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">Menü ve ürünler</h1><p className="mt-2 text-sm font-semibold text-[#7a8580]">{context.branchName} için kategorileri, fiyatları ve mutfak yönlendirmelerini yönetin.</p></div><CatalogManager tenant={tenant} branch={branch} canAvailability={hasAnyPermission(context.permissions, ["catalog.availability"])} {...catalog} /></section>;
}
