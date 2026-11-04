import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireWorkspacePermission } from "@/lib/auth/access";
import { TenantSettingsManager } from "@/modules/settings/components/tenant-settings-manager";
import { getTenantConfiguration } from "@/modules/settings/repository";

export const metadata: Metadata = { title: "İşletme ayarları" };
export const dynamic = "force-dynamic";

export default async function TenantSettingsPage({ params }: { params: Promise<{ tenant: string; branch: string }> }) {
  const { tenant, branch } = await params;
  const context = await requireWorkspacePermission(tenant, branch, ["settings.manage"]);
  const configuration = await getTenantConfiguration(context.tenantId, context.branchId);
  return <section className="p-4 sm:p-6 lg:p-8"><Link href={`/app/${tenant}/${branch}/ayarlar`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#dce3df] bg-white px-4 text-sm font-bold"><ArrowLeft size={16} /> Ayarlara dön</Link><div className="mb-7 mt-6"><p className="text-xs font-black uppercase tracking-[0.16em] text-[#e8623a]">İşletme profili</p><h1 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">Marka ve operasyon</h1><p className="mt-2 text-sm font-semibold text-[#7a8580]">İşletme kimliğini, şube görünümünü ve fiş ayarlarını yönetin.</p></div><TenantSettingsManager tenant={tenant} branch={branch} configuration={configuration} /></section>;
}
