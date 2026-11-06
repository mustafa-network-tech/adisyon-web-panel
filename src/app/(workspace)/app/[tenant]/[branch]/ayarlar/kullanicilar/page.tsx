import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireWorkspacePermission } from "@/lib/auth/access";
import { roleAssignmentRules } from "@/modules/settings/role-rules";
import { TeamManager } from "@/modules/settings/components/team-manager";
import { getTeamSnapshot } from "@/modules/settings/repository";

export const metadata: Metadata = { title: "Kullanıcılar ve roller" };
export const dynamic = "force-dynamic";

export default async function TeamSettingsPage({ params }: { params: Promise<{ tenant: string; branch: string }> }) {
  const { tenant, branch } = await params;
  const context = await requireWorkspacePermission(tenant, branch, ["users.manage"]);
  const snapshot = await getTeamSnapshot(context.tenantId, context.tenantScope);
  return <section className="p-4 sm:p-6 lg:p-8"><Link href={`/app/${tenant}/${branch}/ayarlar`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#dce3df] bg-white px-4 text-sm font-bold"><ArrowLeft size={16} /> Ayarlara dön</Link><div className="mb-7 mt-6"><p className="text-xs font-black uppercase tracking-[0.16em] text-[color:var(--c-accent)]">Ekip güvenliği</p><h1 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">Kullanıcılar ve roller</h1><p className="mt-2 text-sm font-semibold text-[#7a8580]">Katılma taleplerini, sistem rollerini ve şube erişimlerini yönetin.</p></div><TeamManager tenant={tenant} branch={branch} snapshot={snapshot} /><div className="mt-6 rounded-[22px] border border-[#dfe5e1] bg-white p-5 sm:p-6"><h2 className="text-lg font-black">Rol atama kuralları</h2><p className="mt-1 text-xs font-semibold text-[#8a948f]">Bu kurallar veritabanında zorunlu tutulur; ekranı atlayarak değiştirilemez.</p><ul className="mt-4 list-disc space-y-2 pl-5 text-sm font-semibold leading-6 text-[#4b5753]">{roleAssignmentRules.map((rule) => <li key={rule}>{rule}</li>)}</ul></div></section>;
}
