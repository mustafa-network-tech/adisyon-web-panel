"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  hasAnyPermission,
  type Permission,
  workspaceSections,
} from "@/lib/permissions";
import {
  ChefHat,
  CreditCard,
  LayoutGrid,
  BarChart3,
  Bell,
  CalendarDays,
  LifeBuoy,
  LogOut,
  Settings,
  ShieldCheck,
  Wifi,
} from "lucide-react";
import { contactEmail } from "@/lib/site";
import { supportMailto } from "@/lib/support";
import { readOnlyBanner } from "@/modules/plan/usage";
import type { ThemeId } from "@/modules/theme/themes";
import { ServiceAlerts } from "@/modules/notifications/components/service-alerts";
import { signOutAction } from "@/modules/auth/actions";
import { Brand } from "./brand";

type AppShellProps = {
  tenant: string;
  branch: string;
  tenantName: string;
  branchName: string;
  userName: string;
  userRole: string;
  permissions: Permission[];
  supportMode: boolean;
  branches: Array<{ slug: string; name: string }>;
  userId: string;
  branchId: string;
  /** Days left of the trial; null when the business is not on a trial. */
  trialDaysLeft?: number | null;
  /** Set when the trial or subscription has ended: the workspace is read-only. */
  readOnlyStatus?: "trial" | "active" | "suspended" | "cancelled" | null;
  /** Colour theme chosen by the business. */
  theme?: ThemeId;
  children: React.ReactNode;
};

export function AppShell({ tenant, branch, tenantName, branchName, userName, userRole, permissions, supportMode, branches, userId, branchId, trialDaysLeft = null, readOnlyStatus = null, theme = "classic", children }: AppShellProps) {
  const router = useRouter();
  function switchBranch(slug: string) {
    const section = pathname.split("/").slice(4)[0];
    router.push(`/app/${tenant}/${slug}${section ? `/${section}` : ""}`);
  }
  const pathname = usePathname();
  const base = `/app/${tenant}/${branch}`;
  const initials = userName
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("tr-TR"))
    .join("");
  const navItems = [
    { href: `${base}/masalar`, label: "Masalar", icon: LayoutGrid, required: workspaceSections.tables },
    { href: `${base}/mutfak`, label: "Mutfak", icon: ChefHat, required: workspaceSections.kitchen },
    { href: `${base}/kasa`, label: "Kasa", icon: CreditCard, required: workspaceSections.checkout },
    { href: `${base}/rapor`, label: "Raporlar", icon: BarChart3, required: workspaceSections.reports },
    { href: `${base}/personel`, label: "Personel", icon: CalendarDays, required: workspaceSections.staff },
    { href: `${base}/ayarlar`, label: "Ayarlar", icon: Settings, required: workspaceSections.settings },
  ].filter((item) => hasAnyPermission(permissions, item.required));

  return (
    <div data-theme={theme} className="min-h-dvh bg-[#f4f6f8] lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col bg-[color:var(--c-ink)] p-5 text-white lg:flex">
        <Brand inverse />
        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.055] p-3">
          <div className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 text-left">
            <span className="grid size-9 place-items-center rounded-lg bg-[color:var(--c-accent)] text-xs font-black">MR</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-black">{tenantName}</span><span className="mt-1 block truncate text-[11px] font-semibold text-white/45">{branchName}</span></span>
            </div>
          {branches.length > 1 && (
            <label className="mt-2 block">
              <span className="sr-only">Şube seç</span>
              <select value={branch} onChange={(event) => switchBranch(event.target.value)} className="min-h-10 w-full rounded-lg border border-white/15 bg-[color:var(--c-ink)] px-2 text-xs font-bold text-white">
                {branches.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
              </select>
            </label>
          )}
        </div>
        <nav className="mt-7 space-y-1" aria-label="Çalışma alanı menüsü">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link key={href} href={href} className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-bold transition ${active ? "bg-white text-[color:var(--c-ink)] shadow-sm" : "text-white/55 hover:bg-white/5 hover:text-white"}`}>
                <Icon size={19} aria-hidden="true" /> {label}
                {active && <span className="ml-auto size-2 rounded-full bg-[color:var(--c-accent)]" />}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto">
          <div className="mb-3 rounded-xl border border-[#31866e]/30 bg-[#23866b]/15 p-3">
            <p className="flex items-center gap-2 text-xs font-bold text-[#7ed8ba]"><ShieldCheck size={15} /> {supportMode ? "Süreli destek erişimi" : "RLS korumalı oturum"}</p>
            <p className="mt-2 text-[10px] leading-4 text-white/40">{supportMode ? "Bu erişim gerekçeli ve audit log ile izlenir." : "Yetkiler aktif rol ve şube atamanızdan alınır."}</p>
          </div>
          <a href={supportMailto({ business: tenantName, branch: branchName, user: userName })} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-bold text-white/45 hover:bg-white/5 hover:text-white"><LifeBuoy size={18} /> Destek</a>
          <form action={signOutAction}><button type="submit" className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-bold text-white/45 hover:bg-white/5 hover:text-white"><LogOut size={18} /> Oturumu kapat</button></form>
        </div>
      </aside>

      <div className="min-w-0 lg:col-start-2">
        <header className="sticky top-0 z-30 flex min-h-[76px] items-center justify-between border-b border-[#e0e6e2] bg-white/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="lg:hidden"><Brand compact /></div>
          <div className="hidden lg:block">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[color:var(--c-accent)]">{tenantName}</p>
            <p className="mt-1 text-sm font-bold text-[#68736e]">{branchName}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-2 rounded-full bg-[#e7f5ef] px-3 py-2 text-xs font-extrabold text-[#176e56] sm:inline-flex"><Wifi size={14} /> Çevrimiçi</span>
            <Link href={`${base}/ayarlar/bildirimler`} className="grid size-10 place-items-center rounded-xl border border-[#dce3df] text-[#68736e] hover:bg-[#f6f8f7]" aria-label="Bildirim ayarları"><Bell size={18} aria-hidden="true" /></Link>
            <span className="grid size-10 place-items-center rounded-xl bg-[#f1b74a] text-xs font-black text-[color:var(--c-ink)]">{initials || "MK"}</span>
            <div className="hidden sm:block"><p className="text-sm font-black">{userName}</p><p className="mt-0.5 text-[11px] font-semibold text-[#8a948f]">{userRole}</p></div>
          </div>
        </header>
        {readOnlyStatus !== null && (
          <p role="alert" className="bg-[#9e4328] px-4 py-3 text-center text-xs font-bold text-white sm:text-sm">
            {readOnlyBanner(readOnlyStatus)} Etkinleştirmek için <a href={`mailto:${contactEmail}?subject=${encodeURIComponent("Adisyon Web abonelik etkinleştirme")}`} className="font-black underline">{contactEmail}</a> adresine yazın.
          </p>
        )}
        {trialDaysLeft !== null && (
          <p role="status" className={`px-4 py-2.5 text-center text-xs font-bold sm:text-sm ${trialDaysLeft <= 2 ? "bg-[#fff2ed] text-[#9e4328]" : "bg-[#fff8e7] text-[#8a6415]"}`}>
            {trialDaysLeft === 0 ? "Deneme süreniz doldu." : `Deneme sürümü: ${trialDaysLeft} gün kaldı.`} Paket seçmek için <a href={`mailto:${contactEmail}?subject=${encodeURIComponent("Adisyon Web paket talebi")}`} className="font-black underline">{contactEmail}</a> adresine yazın.
          </p>
        )}
        <main className="min-h-[calc(100dvh-76px)] pb-24 lg:pb-0">{children}</main>
        {hasAnyPermission(permissions, ["tables.read", "kitchen.read"]) && <ServiceAlerts tenant={tenant} branch={branch} branchId={branchId} userId={userId} overseesFloor={hasAnyPermission(permissions, ["shifts.manage"])} receivesCalls={hasAnyPermission(permissions, ["tables.read"])} watchesKitchen={hasAnyPermission(permissions, ["kitchen.read"])} />}
      </div>

      <nav className="fixed inset-x-3 bottom-3 z-40 grid rounded-2xl border border-[#dce3df] bg-white/95 p-2 shadow-[0_16px_45px_rgb(23_33_29/0.18)] backdrop-blur-xl lg:hidden" style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }} aria-label="Mobil çalışma alanı menüsü">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return <Link key={href} href={href} className={`flex min-h-13 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-black ${active ? "bg-[color:var(--c-ink)] text-white" : "text-[#75807a]"}`}><Icon size={19} /><span>{label}</span></Link>;
        })}
      </nav>
    </div>
  );
}
