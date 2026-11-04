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
  LogOut,
  Settings,
  ShieldCheck,
  Wifi,
} from "lucide-react";
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
  children: React.ReactNode;
};

export function AppShell({ tenant, branch, tenantName, branchName, userName, userRole, permissions, supportMode, branches, children }: AppShellProps) {
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
    { href: `${base}/ayarlar`, label: "Ayarlar", icon: Settings, required: workspaceSections.settings },
  ].filter((item) => hasAnyPermission(permissions, item.required));

  return (
    <div className="min-h-dvh bg-[#f4f6f8] lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col bg-[#17211d] p-5 text-white lg:flex">
        <Brand inverse />
        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.055] p-3">
          <div className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 text-left">
            <span className="grid size-9 place-items-center rounded-lg bg-[#e8623a] text-xs font-black">MR</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-black">{tenantName}</span><span className="mt-1 block truncate text-[11px] font-semibold text-white/45">{branchName}</span></span>
            </div>
          {branches.length > 1 && (
            <label className="mt-2 block">
              <span className="sr-only">Şube seç</span>
              <select value={branch} onChange={(event) => switchBranch(event.target.value)} className="min-h-10 w-full rounded-lg border border-white/15 bg-[#17211d] px-2 text-xs font-bold text-white">
                {branches.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
              </select>
            </label>
          )}
        </div>
        <nav className="mt-7 space-y-1" aria-label="Çalışma alanı menüsü">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link key={href} href={href} className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-bold transition ${active ? "bg-white text-[#17211d] shadow-sm" : "text-white/55 hover:bg-white/5 hover:text-white"}`}>
                <Icon size={19} aria-hidden="true" /> {label}
                {active && <span className="ml-auto size-2 rounded-full bg-[#e8623a]" />}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto">
          <div className="mb-3 rounded-xl border border-[#31866e]/30 bg-[#23866b]/15 p-3">
            <p className="flex items-center gap-2 text-xs font-bold text-[#7ed8ba]"><ShieldCheck size={15} /> {supportMode ? "Süreli destek erişimi" : "RLS korumalı oturum"}</p>
            <p className="mt-2 text-[10px] leading-4 text-white/40">{supportMode ? "Bu erişim gerekçeli ve audit log ile izlenir." : "Yetkiler aktif rol ve şube atamanızdan alınır."}</p>
          </div>
          <form action={signOutAction}><button type="submit" className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-bold text-white/45 hover:bg-white/5 hover:text-white"><LogOut size={18} /> Oturumu kapat</button></form>
        </div>
      </aside>

      <div className="min-w-0 lg:col-start-2">
        <header className="sticky top-0 z-30 flex min-h-[76px] items-center justify-between border-b border-[#e0e6e2] bg-white/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="lg:hidden"><Brand compact /></div>
          <div className="hidden lg:block">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#e8623a]">{tenantName}</p>
            <p className="mt-1 text-sm font-bold text-[#68736e]">{branchName}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-2 rounded-full bg-[#e7f5ef] px-3 py-2 text-xs font-extrabold text-[#176e56] sm:inline-flex"><Wifi size={14} /> Çevrimiçi</span>
            <span className="grid size-10 place-items-center rounded-xl bg-[#f1b74a] text-xs font-black text-[#17211d]">{initials || "MK"}</span>
            <div className="hidden sm:block"><p className="text-sm font-black">{userName}</p><p className="mt-0.5 text-[11px] font-semibold text-[#8a948f]">{userRole}</p></div>
          </div>
        </header>
        <main className="min-h-[calc(100dvh-76px)] pb-24 lg:pb-0">{children}</main>
      </div>

      <nav className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-4 rounded-2xl border border-[#dce3df] bg-white/95 p-2 shadow-[0_16px_45px_rgb(23_33_29/0.18)] backdrop-blur-xl lg:hidden" aria-label="Mobil çalışma alanı menüsü">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return <Link key={href} href={href} className={`flex min-h-13 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-black ${active ? "bg-[#17211d] text-white" : "text-[#75807a]"}`}><Icon size={19} /><span>{label}</span></Link>;
        })}
      </nav>
    </div>
  );
}
