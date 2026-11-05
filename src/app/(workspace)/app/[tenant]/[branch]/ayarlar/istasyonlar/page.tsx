import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireWorkspacePermission } from "@/lib/auth/access";
import { getCatalogSnapshot } from "@/modules/catalog/repository";
import { getPlanUsage } from "@/modules/plan/repository";
import { StationManager } from "@/modules/stations/components/station-manager";

export const metadata: Metadata = { title: "Mutfak istasyonları" };
export const dynamic = "force-dynamic";

export default async function StationSettingsPage({ params }: { params: Promise<{ tenant: string; branch: string }> }) {
  const { tenant, branch } = await params;
  const context = await requireWorkspacePermission(tenant, branch, ["catalog.manage"]);
  const [catalog, usage] = await Promise.all([
    getCatalogSnapshot(context.tenantId, context.branchId),
    getPlanUsage(context.tenantId, context.branchId),
  ]);

  return (
    <section className="p-4 sm:p-6 lg:p-8">
      <Link href={`/app/${tenant}/${branch}/ayarlar`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#dce3df] bg-white px-4 text-sm font-bold"><ArrowLeft size={16} /> Ayarlara dön</Link>
      <div className="mb-7 mt-6">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[color:var(--c-accent)]">Mutfak</p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">Mutfak istasyonları</h1>
        <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#7a8580]">Mutfak, ızgara, fırın gibi hazırlık bölümlerini tanımlayın. Her ürün bir istasyona bağlıdır; sipariş gönderildiğinde fişler ilgili istasyonun ekranına ayrı ayrı düşer. İsterseniz yalnızca tek “Mutfak” istasyonuyla devam edebilirsiniz.</p>
      </div>
      <StationManager tenant={tenant} branch={branch} stations={catalog.kitchenStations} products={catalog.products} categories={catalog.categories} usage={usage} />
    </section>
  );
}
