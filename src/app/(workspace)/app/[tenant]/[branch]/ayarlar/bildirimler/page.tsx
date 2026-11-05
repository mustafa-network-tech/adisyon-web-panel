import type { Metadata } from "next";
import { BellRing, Ban, ChefHat, Receipt } from "lucide-react";
import { requireWorkspaceAccess } from "@/lib/auth/access";
import { hasAnyPermission } from "@/lib/permissions";
import { NotificationSettings } from "@/modules/notifications/components/notification-settings";
import type { NotificationGroup } from "@/modules/notifications/prefs";
import { getRecentNotifications, type RecentNotification } from "@/modules/notifications/repository";

export const metadata: Metadata = { title: "Bildirimler" };
export const dynamic = "force-dynamic";

const timeFormatter = new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });

const icons: Record<RecentNotification["kind"], typeof BellRing> = { waiter: BellRing, bill: Receipt, void: Ban, comp: Ban, ready: ChefHat };

export default async function NotificationsPage({ params }: { params: Promise<{ tenant: string; branch: string }> }) {
  const { tenant, branch } = await params;
  // Everybody in the workspace has notifications; the settings are per device.
  const context = await requireWorkspaceAccess(tenant, branch);
  const permissions = context.permissions;
  const overseesFloor = hasAnyPermission(permissions, ["shifts.manage"]);

  const availableGroups: NotificationGroup[] = [];
  if (hasAnyPermission(permissions, ["tables.read"])) availableGroups.push("ready", "calls");
  if (overseesFloor || hasAnyPermission(permissions, ["kitchen.read"])) availableGroups.push("voids");

  const recent = availableGroups.length
    ? await getRecentNotifications({ tenantId: context.tenantId, branchId: context.branchId, userId: context.userId, overseesFloor })
    : [];

  return (
    <section className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[color:var(--c-accent)]">{context.branchName} şubesi</p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">Bildirimler</h1>
        <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#7a8580]">Siparişin hazır olması, müşteri çağrıları ve iptal/ikramlar için bu cihazdaki uyarıları ayarlayın.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <NotificationSettings availableGroups={availableGroups} />

        <section className="rounded-[22px] border border-[#dfe5e1] bg-white p-5 sm:p-6" aria-labelledby="son-bildirimler">
          <h2 id="son-bildirimler" className="text-lg font-black">Son 24 saat</h2>
          <ul className="mt-4 divide-y divide-[#edf0ee]">
            {recent.map((item) => {
              const Icon = icons[item.kind];
              return (
                <li key={item.id} className="flex items-start gap-3 py-3">
                  <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-[#f1f3f2] text-[#68736e]"><Icon size={16} aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-black">{item.title}</span>
                    <span className="block text-xs font-semibold leading-5 text-[#68736e]">{item.text}</span>
                  </span>
                  <span className="shrink-0 text-right text-[11px] font-bold text-[#8a948f]">{timeFormatter.format(new Date(item.at))}{item.state && <span className={`mt-1 block ${item.state === "Bekliyor" ? "text-[#b94c2c]" : "text-[#176e56]"}`}>{item.state}</span>}</span>
                </li>
              );
            })}
            {recent.length === 0 && <li className="py-10 text-center text-sm font-semibold text-[#8a948f]">Son 24 saatte bildirim yok.</li>}
          </ul>
        </section>
      </div>
    </section>
  );
}
