import type { Metadata } from "next";
import {
  Building2,
  CalendarClock,
  CircleDollarSign,
  LogOut,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { requirePlatformAdmin } from "@/lib/auth/access";
import { signOutAction } from "@/modules/auth/actions";
import { getPlatformMembers, getPlatformOverview } from "@/modules/platform-admin/data";
import { MembersPanel } from "@/modules/platform-admin/components/members-panel";
import { PlatformActionsPanel } from "@/modules/platform-admin/components/platform-actions-panel";
import type { SubscriptionStatus } from "@/modules/platform-admin/types";

export const metadata: Metadata = { title: "MK Yönetim Paneli", robots: { index: false, follow: false, nocache: true } };
export const dynamic = "force-dynamic";

type PlatformAdminPageProps = {
  searchParams: Promise<{ q?: string }>;
};

const statusLabels: Record<SubscriptionStatus, string> = {
  trial: "Deneme",
  active: "Aktif",
  suspended: "Askıda",
  cancelled: "İptal",
};

function formatDate(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export default async function PlatformAdminPage({
  searchParams,
}: PlatformAdminPageProps) {
  const identity = await requirePlatformAdmin();
  const { q } = await searchParams;
  let overview = null;
  let members: Awaited<ReturnType<typeof getPlatformMembers>> = [];
  let loadError = false;

  try {
    [overview, members] = await Promise.all([getPlatformOverview(q), getPlatformMembers()]);
  } catch {
    loadError = true;
  }

  const metrics = [
    [Building2, "İşletme", overview?.tenantCount ?? 0],
    [Users, "Toplam kullanıcı", overview?.userCount ?? 0],
    [CircleDollarSign, "Aktif abonelik", overview?.activeSubscriptionCount ?? 0],
    [CalendarClock, "Deneme", overview?.trialCount ?? 0],
  ] as const;

  return (
    <main className="min-h-dvh bg-[#f4f6f8]">
      <header className="border-b border-[#dfe5e1] bg-[color:var(--c-ink)] text-white">
        <div className="mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
          <div className="flex items-center gap-4">
            <span className="grid size-11 place-items-center rounded-xl bg-[color:var(--c-accent)] text-xs font-black">MK</span>
            <div><p className="text-sm font-black tracking-wide">DIGITAL SYSTEMS</p><p className="mt-1 text-[10px] font-bold uppercase tracking-[0.15em] text-white/45">Platform yönetimi</p></div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs font-semibold text-white/55 sm:block">{identity.email}</span>
            <form action={signOutAction}><button type="submit" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 px-4 text-xs font-bold text-white/70 hover:bg-white/5"><LogOut size={15} /> Çıkış</button></form>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-xs font-black uppercase tracking-[0.16em] text-[color:var(--c-accent)]">Merkezî yönetim</p><h1 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">İşletmeler</h1><p className="mt-2 text-sm font-semibold text-[#7a8580]">Üyeler kendi işletmesini kurar; burada plan, kullanıcı limiti ve atamaları yönetirsiniz.</p></div>
          <PlatformActionsPanel tenants={(overview?.tenants || []).map((tenant) => ({ id: tenant.id, name: tenant.name, planCode: tenant.planCode, subscriptionStatus: tenant.subscriptionStatus, userLimit: tenant.userLimit, branchLimit: tenant.branchLimit }))} />
        </div>

        {loadError && <div role="alert" className="mt-6 rounded-2xl border border-[#f3d2c6] bg-[#fff7f3] p-4 text-sm font-semibold text-[#9e4328]">Platform verileri okunamadı. Auth/RLS migration dosyasının uygulandığını ve hesabın platform yöneticisi olduğunu kontrol edin.</div>}

        <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {metrics.map(([Icon, label, value]) => <article key={label} className="rounded-2xl border border-[#dfe5e1] bg-white p-4 sm:p-5"><Icon size={20} className="text-[color:var(--c-accent)]" /><p className="mt-5 text-xs font-bold text-[#8a948f]">{label}</p><p className="mt-1 text-2xl font-black">{value}</p></article>)}
        </div>

        <div className="mt-5 overflow-hidden rounded-[24px] border border-[#dfe5e1] bg-white">
          <div className="flex flex-col gap-4 border-b border-[#e5e9e7] p-5 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="text-xl font-black">Tenant listesi</h2><p className="mt-1 text-xs font-semibold text-[#8a948f]">Platformdaki yetkili işletme kayıtları</p></div>
            <form action="/mk-admin" className="flex min-h-11 w-full items-center gap-2 rounded-xl bg-[#f1f3f2] px-3 sm:w-72"><Search size={16} className="text-[#8a948f]" /><input name="q" defaultValue={q} placeholder="İşletme ara" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></form>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead><tr className="border-b border-[#e8ecea] bg-[#fafbfa] text-[10px] font-black uppercase tracking-[0.12em] text-[#8a948f]"><th className="px-5 py-4">İşletme</th><th className="px-5 py-4">Şube</th><th className="px-5 py-4">Kullanıcı</th><th className="px-5 py-4">Plan</th><th className="px-5 py-4">Durum</th><th className="px-5 py-4">Bitiş</th></tr></thead>
              <tbody>
                {overview?.tenants.map((tenant) => <tr key={tenant.id} className="border-b border-[#edf0ee] last:border-0 hover:bg-[#fafbfa]"><td className="px-5 py-4"><p className="text-sm font-black">{tenant.name}</p><p className="mt-1 text-[11px] font-bold text-[#9aa39f]">{tenant.code} · {tenant.slug}</p></td><td className="px-5 py-4 text-sm font-bold">{tenant.branches}</td><td className="px-5 py-4 text-sm font-bold">{tenant.users} / {tenant.userLimit}</td><td className="px-5 py-4 text-sm font-bold">{tenant.planCode}</td><td className="px-5 py-4"><span className={`rounded-lg px-2.5 py-1.5 text-[11px] font-black ${tenant.subscriptionStatus === "active" ? "bg-[#e7f5ef] text-[#176e56]" : tenant.subscriptionStatus === "trial" ? "bg-[#eaf2fb] text-[#285e9f]" : "bg-[#f6ece8] text-[#9e4328]"}`}>{statusLabels[tenant.subscriptionStatus]}</span>{tenant.readOnly && <span className="ml-2 rounded-lg bg-[#9e4328] px-2.5 py-1.5 text-[11px] font-black text-white">Salt okunur</span>}</td><td className="px-5 py-4 text-sm font-bold text-[#68736e]">{formatDate(tenant.expiresAt)}</td></tr>)}
                {!loadError && overview?.tenants.length === 0 && <tr><td colSpan={6} className="px-5 py-12 text-center text-sm font-semibold text-[#8a948f]">Gösterilecek işletme bulunamadı.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <MembersPanel members={members} tenants={(overview?.tenants || []).map((tenant) => ({ id: tenant.id, name: tenant.name }))} />

        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-[#cbded6] bg-[#edf8f3] p-4"><ShieldCheck size={20} className="mt-0.5 shrink-0 text-[#23866b]" /><div><p className="text-sm font-black text-[#176e56]">Sunucu tarafı yetkilendirme ve audit etkin</p><p className="mt-1 text-xs leading-5 text-[#397a67]">Tenant oluşturma ve abonelik değişiklikleri yalnızca doğrulanmış platform yöneticisi RPC’leriyle yapılır. Önceki ve sonraki abonelik değerleri değiştirilemez audit geçmişine yazılır.</p></div></div>
      </section>
    </main>
  );
}
