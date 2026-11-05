import type { Metadata } from "next";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { requireWorkspacePermission } from "@/lib/auth/access";
import { hasAnyPermission, workspaceSections } from "@/lib/permissions";
import { MyShifts } from "@/modules/staff/components/my-shifts";
import { ShiftPlanner } from "@/modules/staff/components/shift-planner";
import { StaffRoster } from "@/modules/staff/components/staff-roster";
import { getStaffSnapshot } from "@/modules/staff/repository";

export const metadata: Metadata = { title: "Personel" };
export const dynamic = "force-dynamic";

export default async function StaffPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string; branch: string }>;
  searchParams: Promise<{ hafta?: string }>;
}) {
  const [{ tenant, branch }, { hafta }] = await Promise.all([params, searchParams]);
  const context = await requireWorkspacePermission(tenant, branch, workspaceSections.staff);
  const canPlan = hasAnyPermission(context.permissions, ["shifts.manage"]);
  const canManageCards = hasAnyPermission(context.permissions, ["staff.manage"]);
  const snapshot = await getStaffSnapshot({
    tenantId: context.tenantId,
    branchId: context.branchId,
    userId: context.userId,
    weekStart: hafta,
    canPlan,
    canManageCards,
  });

  return (
    <section className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[#e8623a]">Personel</p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">Vardiyalar ve personel</h1>
        <p className="mt-2 text-sm font-semibold text-[#7a8580]">{context.branchName} şubesi</p>
      </div>
      {canPlan && <Link href={`/app/${tenant}/${branch}/personel/puantaj`} className="flex items-center gap-4 rounded-[22px] border border-[#dfe5e1] bg-white p-5 hover:border-[#e8623a]"><span className="grid size-11 place-items-center rounded-xl bg-[#e7f5ef] text-[#176e56]"><Wallet size={21} /></span><span><span className="block text-base font-black">Puantaj ve maaş</span><span className="mt-0.5 block text-xs font-semibold text-[#7a8580]">Çalışma saatlerini onaylayın, maaş ve isteğe bağlı prim kayıtlarını yönetin.</span></span></Link>}
      <MyShifts shifts={snapshot.myShifts} today={snapshot.today} />
      {canPlan && (
        <ShiftPlanner
          tenant={tenant}
          branch={branch}
          weekStart={snapshot.weekStart}
          today={snapshot.today}
          members={snapshot.members}
          templates={snapshot.templates}
          shifts={snapshot.weekShifts}
        />
      )}
      {canManageCards && <StaffRoster tenant={tenant} branch={branch} members={snapshot.members} />}
    </section>
  );
}
