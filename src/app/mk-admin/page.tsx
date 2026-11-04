import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Building2, CalendarClock, CircleDollarSign, Plus, Search, ShieldCheck, Users } from "lucide-react";

export const metadata: Metadata = { title: "MK Yönetim Paneli" };

const tenants = [
  { name: "Meydan Restoran", code: "MK-0001", branches: 2, users: 14, status: "Aktif", plan: "Profesyonel", renewal: "18 Ara 2026", color: "bg-[#e7f5ef] text-[#176e56]" },
  { name: "Kıyı Balık", code: "MK-0002", branches: 1, users: 8, status: "Deneme", plan: "Başlangıç", renewal: "12 Kas 2026", color: "bg-[#eaf2fb] text-[#285e9f]" },
  { name: "Nar Mutfak", code: "MK-0003", branches: 3, users: 22, status: "Aktif", plan: "Profesyonel", renewal: "01 Oca 2027", color: "bg-[#e7f5ef] text-[#176e56]" },
];

export default function PlatformAdminPage() {
  return (
    <main className="min-h-dvh bg-[#f4f6f8]">
      <header className="border-b border-[#dfe5e1] bg-[#17211d] text-white"><div className="mx-auto flex min-h-20 max-w-7xl items-center justify-between px-5 sm:px-8"><div className="flex items-center gap-4"><span className="grid size-11 place-items-center rounded-xl bg-[#e8623a] text-xs font-black">MK</span><div><p className="text-sm font-black tracking-wide">DIGITAL SYSTEMS</p><p className="mt-1 text-[10px] font-bold uppercase tracking-[0.15em] text-white/45">Platform yönetimi</p></div></div><Link href="/giris" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 px-4 text-xs font-bold text-white/70 hover:bg-white/5"><ArrowLeft size={15} /> İşletme girişine dön</Link></div></header>
      <section className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-[#e8623a]">Merkezî yönetim</p><h1 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">İşletmeler</h1><p className="mt-2 text-sm font-semibold text-[#7a8580]">Tenant yaşam döngüsü ve manuel abonelik yönetimi.</p></div><button type="button" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#e8623a] px-5 text-sm font-black text-white"><Plus size={17} /> Yeni işletme</button></div>
        <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">{[[Building2, "İşletme", "3"], [Users, "Toplam kullanıcı", "44"], [CircleDollarSign, "Aktif abonelik", "2"], [CalendarClock, "Deneme", "1"]].map(([Icon, label, value]) => { const ItemIcon = Icon as typeof Building2; return <article key={label as string} className="rounded-2xl border border-[#dfe5e1] bg-white p-4 sm:p-5"><ItemIcon size={20} className="text-[#e8623a]" /><p className="mt-5 text-xs font-bold text-[#8a948f]">{label as string}</p><p className="mt-1 text-2xl font-black">{value as string}</p></article>; })}</div>
        <div className="mt-5 overflow-hidden rounded-[24px] border border-[#dfe5e1] bg-white">
          <div className="flex flex-col gap-4 border-b border-[#e5e9e7] p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-black">Tenant listesi</h2><p className="mt-1 text-xs font-semibold text-[#8a948f]">Platformdaki tüm işletmeler</p></div><label className="flex min-h-11 w-full items-center gap-2 rounded-xl bg-[#f1f3f2] px-3 sm:w-72"><Search size={16} className="text-[#8a948f]" /><input placeholder="İşletme ara" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] border-collapse text-left"><thead><tr className="border-b border-[#e8ecea] bg-[#fafbfa] text-[10px] font-black uppercase tracking-[0.12em] text-[#8a948f]"><th className="px-5 py-4">İşletme</th><th className="px-5 py-4">Şube</th><th className="px-5 py-4">Kullanıcı</th><th className="px-5 py-4">Plan</th><th className="px-5 py-4">Durum</th><th className="px-5 py-4">Bitiş</th></tr></thead><tbody>{tenants.map((tenant) => <tr key={tenant.code} className="border-b border-[#edf0ee] last:border-0 hover:bg-[#fafbfa]"><td className="px-5 py-4"><p className="text-sm font-black">{tenant.name}</p><p className="mt-1 text-[11px] font-bold text-[#9aa39f]">{tenant.code}</p></td><td className="px-5 py-4 text-sm font-bold">{tenant.branches}</td><td className="px-5 py-4 text-sm font-bold">{tenant.users}</td><td className="px-5 py-4 text-sm font-bold">{tenant.plan}</td><td className="px-5 py-4"><span className={`rounded-lg px-2.5 py-1.5 text-[11px] font-black ${tenant.color}`}>{tenant.status}</span></td><td className="px-5 py-4 text-sm font-bold text-[#68736e]">{tenant.renewal}</td></tr>)}</tbody></table></div>
        </div>
        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-[#cbded6] bg-[#edf8f3] p-4"><ShieldCheck size={20} className="mt-0.5 shrink-0 text-[#23866b]" /><div><p className="text-sm font-black text-[#176e56]">Platform yöneticisi sınırı</p><p className="mt-1 text-xs leading-5 text-[#397a67]">Bu Faz 1 ekranı yalnızca arayüz prototipidir. Gerçek tenant oluşturma ve abonelik güncelleme işlemleri Faz 2&apos;de sunucu tarafı yetkilendirme ve audit log ile açılacaktır.</p></div></div>
      </section>
    </main>
  );
}
