import type { Metadata } from "next";
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
