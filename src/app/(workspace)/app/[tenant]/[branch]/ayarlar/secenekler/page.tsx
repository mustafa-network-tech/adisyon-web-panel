import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireWorkspacePermission } from "@/lib/auth/access";
import { hasAnyPermission } from "@/lib/permissions";
import { OptionManager } from "@/modules/catalog/components/option-manager";
import { getCatalogSnapshot } from "@/modules/catalog/repository";

export const metadata: Metadata = { title: "Ürün seçenekleri" };
export const dynamic = "force-dynamic";

export default async function OptionSettingsPage({ params }: { params: Promise<{ tenant: string; branch: string }> }) {
  const { tenant, branch } = await params;
  const context = await requireWorkspacePermission(tenant, branch, ["catalog.manage"]);
  const catalog = await getCatalogSnapshot(context.tenantId, context.branchId);

  return (
    <section className="p-4 sm:p-6 lg:p-8">
      <Link href={`/app/${tenant}/${branch}/ayarlar`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#dce3df] bg-white px-4 text-sm font-bold"><ArrowLeft size={16} /> Ayarlara dön</Link>
      <div className="mb-7 mt-6">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[color:var(--c-accent)]">Katalog</p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">Ürün seçenekleri</h1>
        <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#7a8580]">Porsiyon (yarım/tam/büyük), ekstra (peynir, sos) ve çıkarılacak malzeme (soğansız) seçeneklerini tanımlayın. Müşteri ve garson sipariş verirken bunları seçer; fiyat farkı otomatik eklenir, mutfak fişinde görünür.</p>
      </div>
      <OptionManager tenant={tenant} branch={branch} groups={catalog.optionGroups} products={catalog.products} canAvailability={hasAnyPermission(context.permissions, ["catalog.availability"])} />
    </section>
  );
}
