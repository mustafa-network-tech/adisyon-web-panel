import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireWorkspacePermission } from "@/lib/auth/access";
import { hasAnyPermission } from "@/lib/permissions";
import { PayrollBoard } from "@/modules/payroll/components/payroll-board";
import { getPayrollSnapshot } from "@/modules/payroll/repository";

export const metadata: Metadata = { title: "Puantaj ve maaş" };
export const dynamic = "force-dynamic";

export default async function PayrollPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string; branch: string }>;
  searchParams: Promise<{ ay?: string }>;
}) {
  const [{ tenant, branch }, { ay }] = await Promise.all([params, searchParams]);
  const context = await requireWorkspacePermission(tenant, branch, ["attendance.manage", "payroll.manage"]);
  const canPayroll = hasAnyPermission(context.permissions, ["payroll.manage"]);
  const canApprove = hasAnyPermission(context.permissions, ["attendance.manage"]);
  if (!hasAnyPermission(context.permissions, ["shifts.manage"])) {
    // Pay-only roles still need the shift list to read the month, which RLS limits to planners.
    return (
      <section className="p-4 sm:p-6 lg:p-8">
        <p className="rounded-2xl bg-[#fff8e7] p-5 text-sm font-bold text-[#8a6415]">Puantaj ekranı vardiya listesini okumak için vardiya planlama yetkisi de ister. Şirket yöneticinizden bu yetkiyi kontrol etmesini isteyin.</p>
      </section>
    );
  }
  const snapshot = await getPayrollSnapshot({
    tenantId: context.tenantId,
    branchId: context.branchId,
    period: ay,
    canPayroll,
    canApprove,
  });

  const description = canPayroll
    ? "Çalışma saatlerini onaylayın, maaş ve isteğe bağlı prim, kesinti, avans kayıtlarını yönetin."
    : `${canApprove ? "Personelin fiilen çalıştığı süreleri onaylayın." : "Onaylanan çalışma sürelerini görüntülüyorsunuz."} Maaş bilgileri yalnızca yetkili kişilere açıktır.`;

  return (
    <section className="p-4 sm:p-6 lg:p-8">
      <Link href={`/app/${tenant}/${branch}/personel`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#dce3df] bg-white px-4 text-sm font-bold"><ArrowLeft size={16} /> Personel</Link>
      <div className="mb-7 mt-6">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[#e8623a]">{context.branchName} şubesi</p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">{canPayroll ? "Puantaj ve maaş" : canApprove ? "Puantaj onayı" : "Puantaj"}</h1>
        <p className="mt-2 text-sm font-semibold text-[#7a8580]">{description}</p>
      </div>
      <PayrollBoard tenant={tenant} branch={branch} snapshot={snapshot} />
    </section>
  );
}
