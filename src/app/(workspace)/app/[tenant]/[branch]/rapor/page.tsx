import type { Metadata } from "next";
import Link from "next/link";
import { requireWorkspacePermission } from "@/lib/auth/access";
import { hasAnyPermission } from "@/lib/permissions";
import { ReportExport } from "@/modules/reports/components/report-export";
import { ReportView } from "@/modules/reports/components/report-view";
import { resolveRange } from "@/modules/reports/range";
import { DiscountAudit } from "@/modules/reports/components/discount-audit";
import { getDiscountAudit, getSalesReport } from "@/modules/reports/repository";
import { todayInTurkey } from "@/modules/staff/dates";

export const metadata: Metadata = { title: "Raporlar" };
export const dynamic = "force-dynamic";

const presets = [
  { id: "today", label: "Bugün", history: false },
  { id: "yesterday", label: "Dün", history: true },
  { id: "last7", label: "Son 7 gün", history: true },
  { id: "week", label: "Bu hafta", history: true },
  { id: "month", label: "Bu ay", history: true },
] as const;

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string; branch: string }>;
  searchParams: Promise<{ from?: string; to?: string; preset?: string }>;
}) {
  const [{ tenant, branch }, query] = await Promise.all([params, searchParams]);
  const context = await requireWorkspacePermission(tenant, branch, ["reports.read"]);
  const canSeeHistory = hasAnyPermission(context.permissions, ["reports.history"]);
  const today = todayInTurkey();
  const [from, to] = resolveRange(canSeeHistory ? query : {}, today);
  const [{ report, error }, discountRows] = await Promise.all([
    getSalesReport({ tenantId: context.tenantId, branchId: context.branchId, from, to }),
    getDiscountAudit({ tenantId: context.tenantId, branchId: context.branchId, from, to }),
  ]);
  const base = `/app/${tenant}/${branch}/rapor`;

  return (
    <section className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[color:var(--c-accent)]">{context.branchName} şubesi</p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">Satış raporları</h1>
          <p className="mt-2 text-sm font-semibold text-[#7a8580]">{from === to ? from : `${from} – ${to}`}{canSeeHistory ? "" : " · yalnızca bugün görüntülenebilir"}</p>
        </div>
        {report && <ReportExport report={report} />}
      </div>

      {canSeeHistory && (
        <div className="flex flex-wrap items-end gap-2">
          {presets.map((preset) => (
            <Link key={preset.id} href={`${base}?preset=${preset.id}`} className="inline-flex min-h-10 items-center rounded-xl border border-[#dce3df] bg-white px-4 text-sm font-black hover:border-[color:var(--c-accent)]">{preset.label}</Link>
          ))}
          <form action={base} className="flex flex-wrap items-end gap-2">
            <label className="text-xs font-bold text-[#68736e]">Başlangıç<input type="date" name="from" defaultValue={from} max={today} className="mt-1 block min-h-10 rounded-xl border border-[#dce3df] bg-white px-3 text-sm" /></label>
            <label className="text-xs font-bold text-[#68736e]">Bitiş<input type="date" name="to" defaultValue={to} max={today} className="mt-1 block min-h-10 rounded-xl border border-[#dce3df] bg-white px-3 text-sm" /></label>
            <button className="min-h-10 rounded-xl bg-[color:var(--c-ink)] px-4 text-sm font-black text-white">Göster</button>
          </form>
        </div>
      )}

      {error && <p role="alert" className="rounded-2xl bg-[#fff7f3] p-5 text-sm font-bold text-[#9e4328]">{error}</p>}
      {report && <ReportView report={report} />}
      {report && <DiscountAudit rows={discountRows} />}
    </section>
  );
}
