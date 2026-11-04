"use client";

import { useMemo, useState } from "react";
import { Banknote, CheckCircle2, CreditCard, ReceiptText, Scissors, WalletCards } from "lucide-react";
import { formatMoney } from "@/lib/money";
import type { PaymentMethod } from "@/modules/cash-register/types";

const openChecks = [
  { id: "m05", table: "M05", totalMinor: 218000, age: "47 dk", server: "Arda" },
  { id: "t02", table: "T02", totalMinor: 166000, age: "39 dk", server: "Ece" },
  { id: "m06", table: "M06", totalMinor: 148000, age: "28 dk", server: "Ece" },
  { id: "m02", table: "M02", totalMinor: 124000, age: "34 dk", server: "Ece" },
];

export function CheckoutPanel() {
  const [selectedId, setSelectedId] = useState("m05");
  const [method, setMethod] = useState<PaymentMethod | "split">("card");
  const [paid, setPaid] = useState<string[]>([]);
  const selected = useMemo(() => openChecks.find((check) => check.id === selectedId) ?? openChecks[0], [selectedId]);
  const isPaid = paid.includes(selected.id);

  function completePayment() {
    setPaid((items) => items.includes(selected.id) ? items : [...items, selected.id]);
  }

  return (
    <section className="p-4 sm:p-6 lg:p-8">
      <div><p className="text-xs font-black uppercase tracking-[0.16em] text-[#e8623a]">Kasa ekranı</p><h1 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">Ödeme & vardiya</h1><p className="mt-2 text-sm font-semibold text-[#7a8580]">Kasa 01 · 16:00 tarihinde açıldı · Arda Yılmaz</p></div>
      <div className="mt-7 grid gap-5 xl:grid-cols-[1fr_420px]">
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[["Açık hesap", "4", ReceiptText, "text-[#c94927] bg-[#fff0ea]"], ["Nakit", "₺12.480", Banknote, "text-[#176e56] bg-[#e7f5ef]"], ["Kart", "₺31.720", CreditCard, "text-[#285e9f] bg-[#eaf2fb]"], ["Toplam", "₺44.200", WalletCards, "text-[#6f4fa0] bg-[#f0eafb]"]].map(([label, value, Icon, style]) => { const ItemIcon = Icon as typeof ReceiptText; return <article key={label as string} className="rounded-2xl border border-[#dfe5e1] bg-white p-4"><span className={`grid size-10 place-items-center rounded-xl ${style}`}><ItemIcon size={19} /></span><p className="mt-5 text-xs font-bold text-[#8a948f]">{label as string}</p><p className="mt-1 text-xl font-black">{value as string}</p></article>; })}
          </div>
          <div className="rounded-[24px] border border-[#dfe5e1] bg-white p-4 sm:p-5">
            <div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.15em] text-[#8a948f]">Tahsilat bekleyen</p><h2 className="mt-1 text-xl font-black">Açık adisyonlar</h2></div><span className="rounded-lg bg-[#f0f2f1] px-3 py-2 text-xs font-bold text-[#68736e]">{openChecks.length} hesap</span></div>
            <div className="mt-5 space-y-2">{openChecks.map((check) => <button key={check.id} type="button" onClick={() => setSelectedId(check.id)} className={`flex min-h-20 w-full items-center gap-4 rounded-2xl border p-3 text-left transition ${selectedId === check.id ? "border-[#e8623a] bg-[#fff9f6] ring-4 ring-[#fff0ea]" : "border-[#e1e6e3] hover:bg-[#f8f9f8]"}`}><span className="grid size-12 shrink-0 place-items-center rounded-xl bg-[#17211d] text-sm font-black text-white">{check.table}</span><span className="min-w-0 flex-1"><span className="block text-sm font-black">{check.server} · {check.age}</span><span className="mt-1 block text-xs font-bold text-[#8a948f]">Masa adisyonu</span></span><span className="text-base font-black">{formatMoney(check.totalMinor)}</span>{paid.includes(check.id) && <CheckCircle2 size={20} className="text-[#23866b]" />}</button>)}</div>
          </div>
        </div>

        <aside className="rounded-[24px] border border-[#dfe5e1] bg-white p-5 shadow-[0_14px_36px_rgb(23_33_29/0.05)]">
          <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[#e8623a]">Ödeme al</p><div className="mt-2 flex items-start justify-between"><div><h2 className="text-3xl font-black">{selected.table}</h2><p className="mt-1 text-xs font-bold text-[#8a948f]">Adisyon #{selected.id.toUpperCase()}</p></div><span className="rounded-xl bg-[#f0f2f1] px-3 py-2 text-xs font-bold">{selected.age}</span></div>
          <div className="my-6 border-y border-dashed border-[#dce3df] py-6"><p className="text-xs font-bold text-[#8a948f]">Ödenecek toplam</p><p className="mt-2 text-4xl font-black tracking-[-0.04em]">{formatMoney(selected.totalMinor)}</p></div>
          <p className="text-xs font-black uppercase tracking-[0.13em] text-[#8a948f]">Ödeme yöntemi</p>
          <div className="mt-3 grid grid-cols-3 gap-2">{([{ value: "cash", label: "Nakit", icon: Banknote }, { value: "card", label: "Kart", icon: CreditCard }, { value: "split", label: "Böl", icon: Scissors }] as const).map(({ value, label, icon: Icon }) => <button key={value} type="button" onClick={() => setMethod(value)} className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border text-xs font-black ${method === value ? "border-[#17211d] bg-[#17211d] text-white" : "border-[#dce3df] bg-white text-[#68736e] hover:bg-[#f7f9f8]"}`}><Icon size={20} />{label}</button>)}</div>
          {method === "split" && <div className="mt-4 rounded-xl bg-[#fff7e4] p-3 text-xs font-semibold leading-5 text-[#855c16]">Hesap bölme arayüzü hazırlandı. Kalıcı bölme ve ödeme tahsisi Faz 2 veritabanı işlemleriyle etkinleşecek.</div>}
          <button type="button" onClick={completePayment} disabled={isPaid} className="mt-6 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#e8623a] px-5 text-sm font-black text-white disabled:bg-[#23866b]"><CheckCircle2 size={18} />{isPaid ? "Ödeme kaydedildi" : `${method === "cash" ? "Nakit" : method === "card" ? "Kart" : "Bölünmüş"} ödemeyi tamamla`}</button>
          <p className="mt-4 text-center text-[10px] font-semibold leading-4 text-[#9aa39f]">Demo işlemidir. Finansal kayıt veya gerçek ödeme oluşturmaz.</p>
        </aside>
      </div>
    </section>
  );
}
