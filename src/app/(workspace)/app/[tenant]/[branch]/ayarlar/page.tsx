import type { Metadata } from "next";
import { Bell, Building2, ChefHat, ChevronRight, Palette, ShieldCheck, TableProperties, Users } from "lucide-react";

export const metadata: Metadata = { title: "Ayarlar" };

const groups = [
  [Building2, "İşletme profili", "Unvan, iletişim ve şube bilgileri"],
  [TableProperties, "Salon & masalar", "Alanlar, masa düzeni ve kapasiteler"],
  [ChefHat, "Mutfak istasyonları", "Ürün yönlendirme ve istasyon kuralları"],
  [Users, "Kullanıcılar & roller", "Ekip, şube erişimi ve yetkiler"],
  [Palette, "Tema", "Logo, kurumsal renk ve görünüm"],
  [Bell, "Bildirimler", "Operasyon uyarıları ve PWA tercihleri"],
];

export default function SettingsPage() {
  return <section className="p-4 sm:p-6 lg:p-8"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-[#e8623a]">İşletme ayarları</p><h1 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">Yapılandırma merkezi</h1><p className="mt-2 text-sm font-semibold text-[#7a8580]">İşletmenizi, ekibinizi ve operasyon kurallarını yönetin.</p></div><div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{groups.map(([Icon, title, text]) => { const ItemIcon = Icon as typeof Building2; return <button key={title as string} type="button" className="group flex min-h-36 items-start gap-4 rounded-[22px] border border-[#dfe5e1] bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-[#e8b29f] hover:shadow-[0_14px_32px_rgb(23_33_29/0.07)]"><span className="grid size-12 shrink-0 place-items-center rounded-xl bg-[#fff0ea] text-[#c94927]"><ItemIcon size={21} /></span><span className="min-w-0 flex-1"><span className="block text-lg font-black">{title as string}</span><span className="mt-2 block text-sm leading-6 text-[#7a8580]">{text as string}</span></span><ChevronRight size={19} className="mt-1 text-[#a4ada8] transition group-hover:translate-x-1 group-hover:text-[#e8623a]" /></button>; })}</div><div className="mt-6 flex items-start gap-3 rounded-2xl border border-[#bddfcf] bg-[#edf8f3] p-4"><ShieldCheck className="mt-0.5 shrink-0 text-[#23866b]" size={20} /><div><p className="text-sm font-black text-[#176e56]">Tenant güvenlik sınırı etkin tasarlandı</p><p className="mt-1 text-xs leading-5 text-[#397a67]">Ayar değişiklikleri Faz 2&apos;de rol kontrolleri, RLS politikaları ve denetim kayıtlarıyla kalıcı hâle gelecek.</p></div></div></section>;
}
