import Link from "next/link";
import { ArrowLeft, ReceiptText } from "lucide-react";

export default async function OrderPage({ params }: { params: Promise<{ tenant: string; branch: string; orderId: string }> }) {
  const { tenant, branch, orderId } = await params;
  return <section className="p-4 sm:p-6 lg:p-8"><Link href={`/app/${tenant}/${branch}/masalar`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#dce3df] bg-white px-4 text-sm font-bold"><ArrowLeft size={17} /> Masalara dön</Link><div className="mt-6 rounded-[24px] border border-[#dfe5e1] bg-white p-8"><ReceiptText size={28} className="text-[#e8623a]" /><p className="mt-5 text-xs font-black uppercase tracking-[0.14em] text-[#8a948f]">Sipariş ayrıntısı</p><h1 className="mt-2 text-3xl font-black">#{orderId}</h1><p className="mt-3 text-sm leading-6 text-[#7a8580]">Kalıcı sipariş verisi ve durum geçmişi Faz 2 Supabase entegrasyonuyla bu sayfaya bağlanacak.</p></div></section>;
}
