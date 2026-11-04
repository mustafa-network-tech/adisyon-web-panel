import Link from "next/link";
import { WifiOff } from "lucide-react";
import { Brand } from "@/components/brand";

export default function OfflinePage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-[#f4f6f8] p-6">
      <section className="w-full max-w-md rounded-[28px] border border-[#dfe5e1] bg-white p-8 text-center shadow-[0_24px_70px_rgb(23_33_29/0.08)]">
        <Brand />
        <div className="mx-auto mt-10 grid size-16 place-items-center rounded-2xl bg-[#fff0ea] text-[#c94927]">
          <WifiOff aria-hidden="true" size={30} />
        </div>
        <h1 className="mt-6 text-2xl font-black tracking-tight">Bağlantı kesildi</h1>
        <p className="mt-3 text-sm leading-6 text-[#68736e]">
          Güvenli sipariş ve ödeme işlemleri için internet bağlantısı gerekiyor. Bağlantınızı kontrol edip yeniden deneyin.
        </p>
        <Link href="/giris" className="mt-7 inline-flex min-h-12 items-center justify-center rounded-xl bg-[#17211d] px-6 font-bold text-white">
          Yeniden dene
        </Link>
      </section>
    </main>
  );
}
