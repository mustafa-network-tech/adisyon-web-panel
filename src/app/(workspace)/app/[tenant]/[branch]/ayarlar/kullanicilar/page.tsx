import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireWorkspacePermission } from "@/lib/auth/access";
import { TeamManager } from "@/modules/settings/components/team-manager";
import { getTeamSnapshot } from "@/modules/settings/repository";

export const metadata: Metadata = { title: "Kullanıcılar ve roller" };
export const dynamic = "force-dynamic";

export default async function TeamSettingsPage({ params }: { params: Promise<{ tenant: string; branch: string }> }) {
  const { tenant, branch } = await params;
  const context = await requireWorkspacePermission(tenant, branch, ["users.manage"]);
  const snapshot = await getTeamSnapshot(context.tenantId);
  return <section className="p-4 sm:p-6 lg:p-8"><Link href={`/app/${tenant}/${branch}/ayarlar`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#dce3df] bg-white px-4 text-sm font-bold"><ArrowLeft size={16} /> Ayarlara dön</Link><div className="mb-7 mt-6"><p className="text-xs font-black uppercase tracking-[0.16em] text-[#e8623a]">Ekip güvenliği</p><h1 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">Kullanıcılar ve roller</h1><p className="mt-2 text-sm font-semibold text-[#7a8580]">Davetleri, sistem rollerini ve şube erişimlerini yönetin.</p></div><TeamManager tenant={tenant} branch={branch} snapshot={snapshot} /></section>;
}
