import type { Metadata } from "next";
import Link from "next/link";
import { Bell, BookOpen, Layers, ScrollText, Building2, ChefHat, ChevronRight, Palette, QrCode, ShieldCheck, TableProperties, Users } from "lucide-react";
import { requireWorkspacePermission } from "@/lib/auth/access";
import { hasAnyPermission, workspaceSections, type Permission } from "@/lib/permissions";

export const metadata: Metadata = { title: "Ayarlar" };

const groups = [
  { icon: Building2, title: "İşletme profili", text: "Unvan, iletişim ve şube bilgileri", required: ["settings.manage"], href: "isletme" },
  { icon: TableProperties, title: "Salon & masalar", text: "Alanlar, masa düzeni ve kapasiteler", required: ["settings.manage"], href: "salonlar" },
  { icon: BookOpen, title: "Menü & ürünler", text: "Kategoriler, fiyatlar ve ürün durumu", required: ["catalog.manage"], href: "menu" },
  { icon: Layers, title: "Ürün seçenekleri", text: "Porsiyon, ekstra ve çıkarılacak malzeme", required: ["catalog.manage"], href: "secenekler" },
  { icon: QrCode, title: "QR menü", text: "Masa QR kodları ve müşteri sipariş modu", required: ["settings.manage"], href: "qr-menu" },
  { icon: ChefHat, title: "Mutfak istasyonları", text: "Mutfak, ızgara, fırın gibi hazırlık bölümleri", required: ["catalog.manage"], href: "istasyonlar" },
  { icon: ScrollText, title: "Denetim kaydı", text: "Kim, ne zaman, neyi değiştirdi", required: ["settings.manage"], href: "denetim" },
  { icon: Users, title: "Kullanıcılar & roller", text: "Ekip, şube erişimi ve yetkiler", required: ["users.manage"], href: "kullanicilar" },
  { icon: Palette, title: "Tema", text: "Üç hazır renk teması", required: ["settings.manage"], href: "tema" },
  { icon: Bell, title: "Bildirimler", text: "Operasyon uyarıları ve PWA tercihleri", required: ["settings.manage"], href: null },
] satisfies Array<{ icon: typeof Building2; title: string; text: string; required: Permission[]; href: string | null }>;

export default async function SettingsPage({ params }: { params: Promise<{ tenant: string; branch: string }> }) {
  const { tenant, branch } = await params;
  const context = await requireWorkspacePermission(tenant, branch, workspaceSections.settings);
  const visibleGroups = groups.filter((group) => hasAnyPermission(context.permissions, group.required));

  return <section className="p-4 sm:p-6 lg:p-8"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-[color:var(--c-accent)]">İşletme ayarları</p><h1 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">Yapılandırma merkezi</h1><p className="mt-2 text-sm font-semibold text-[#7a8580]">{context.branchName} yapılandırmasını rol izinleriniz kapsamında yönetin.</p></div><div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visibleGroups.map(({ icon: Icon, title, text, href }) => { const content = <><span className="grid size-12 shrink-0 place-items-center rounded-xl bg-[color:var(--c-accent-soft)] text-[color:var(--c-accent-d2)]"><Icon size={21} /></span><span className="min-w-0 flex-1"><span className="block text-lg font-black">{title}</span><span className="mt-2 block text-sm leading-6 text-[#7a8580]">{text}</span>{!href && <span className="mt-3 block text-[10px] font-black uppercase tracking-[0.12em] text-[#a1aaa5]">Sonraki modül</span>}</span><ChevronRight size={19} className="mt-1 text-[#a4ada8] transition group-hover:translate-x-1 group-hover:text-[color:var(--c-accent)]" /></>; const className = `group flex min-h-36 items-start gap-4 rounded-[22px] border border-[#dfe5e1] bg-white p-5 text-left transition ${href ? "hover:-translate-y-0.5 hover:border-[#e8b29f] hover:shadow-[0_14px_32px_rgb(23_33_29/0.07)]" : "opacity-65"}`; return href ? <Link key={title} href={`/app/${tenant}/${branch}/ayarlar/${href}`} className={className}>{content}</Link> : <div key={title} className={className}>{content}</div>; })}</div><div className="mt-6 flex items-start gap-3 rounded-2xl border border-[#bddfcf] bg-[#edf8f3] p-4"><ShieldCheck className="mt-0.5 shrink-0 text-[#23866b]" size={20} /><div><p className="text-sm font-black text-[#176e56]">RLS ve sunucu doğrulaması etkin</p><p className="mt-1 text-xs leading-5 text-[#397a67]">Menü, salon ve masa değişiklikleri aktif üyelik, atanmış şube ve gerekli rol izniyle doğrulanır.</p></div></div></section>;
}
