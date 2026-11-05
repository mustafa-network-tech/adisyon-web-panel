"use client";

import { useState, useTransition } from "react";
import { Copy, Download, Printer, RefreshCcw, Smartphone, UserRound } from "lucide-react";
import { rotateTableQrAction, setQrOrderingAction } from "../actions";
import type { QrTableEntry } from "../types";

type Props = {
  tenant: string;
  branch: string;
  orderingEnabled: boolean;
  tables: QrTableEntry[];
};

export function QrManager({ tenant, branch, orderingEnabled, tables }: Props) {
  const [ordering, setOrdering] = useState(orderingEnabled);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [printId, setPrintId] = useState<string | null>(null);

  function printOne(tableId: string) {
    setPrintId(tableId);
    const reset = () => {
      setPrintId(null);
      window.removeEventListener("afterprint", reset);
    };
    window.addEventListener("afterprint", reset);
    setTimeout(() => window.print(), 50);
  }

  function download(table: QrTableEntry) {
    const size = 900;
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size + 220;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#17211d";
      ctx.textAlign = "center";
      ctx.font = "700 40px Arial, sans-serif";
      ctx.fillText(table.areaName, size / 2, 70);
      ctx.font = "800 84px Arial, sans-serif";
      ctx.fillText(table.label, size / 2, 160);
      ctx.drawImage(image, 50, 190, size - 100, size - 100);
      ctx.font = "600 34px Arial, sans-serif";
      ctx.fillText("Menü için kodu telefonunuzla okutun", size / 2, size + 130);
      const link = document.createElement("a");
      link.download = `qr-${table.areaName}-${table.label}.png`.replace(/\s+/g, "-").toLowerCase();
      link.href = canvas.toDataURL("image/png");
      link.click();
    };
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(table.svg)}`;
  }

  function toggle(next: boolean) {
    setOrdering(next);
    setNotice(null);
    startTransition(async () => {
      const result = await setQrOrderingAction({ tenant, branch, enabled: next });
      if (!result.ok) setOrdering(!next);
      setNotice(result);
    });
  }

  function rotate(tableId: string, label: string) {
    if (!window.confirm(`${label} için QR kod yenilensin mi? Basılı eski kod çalışmayacak.`)) return;
    setNotice(null);
    startTransition(async () => {
      setNotice(await rotateTableQrAction({ tenant, branch, tableId }));
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[22px] border border-[#dfe5e1] bg-white p-5 print:hidden">
        <h2 className="text-lg font-black">Sipariş modu</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {[
            { value: false, icon: UserRound, title: "Yalnızca menü", text: "Müşteri menüyü görür; siparişi garson alır." },
            { value: true, icon: Smartphone, title: "Müşteri sipariş verebilsin", text: "Sipariş garson, mutfak ve kasaya anında düşer." },
          ].map(({ value, icon: Icon, title, text }) => (
            <button
              key={title}
              type="button"
              disabled={pending}
              onClick={() => toggle(value)}
              aria-pressed={ordering === value}
              className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition ${
                ordering === value
                  ? "border-[color:var(--c-accent)] bg-[color:var(--c-accent-soft)]"
                  : "border-[#dfe5e1] hover:border-[#e8b29f]"
              }`}
            >
              <Icon className="mt-0.5 shrink-0 text-[color:var(--c-accent-d2)]" size={20} />
              <span>
                <span className="block font-black">{title}</span>
                <span className="mt-1 block text-sm text-[#68736e]">{text}</span>
              </span>
            </button>
          ))}
        </div>
        {notice && (
          <p
            role="status"
            className={`mt-4 rounded-xl p-3 text-sm font-bold ${
              notice.ok ? "bg-[#edf8f3] text-[#176e56]" : "bg-[#fdeeee] text-[#a73a3a]"
            }`}
          >
            {notice.message}
          </p>
        )}
      </section>

      <div className="flex items-center justify-between print:hidden">
        <h2 className="text-lg font-black">Masa QR kodları ({tables.length})</h2>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={!tables.length}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[color:var(--c-ink)] px-4 text-sm font-black text-white disabled:opacity-50"
        >
          <Printer size={16} /> Tümünü yazdır
        </button>
      </div>

      {tables.length === 0 && (
        <p className="rounded-2xl border border-dashed border-[#cfd8d3] p-8 text-center text-sm font-semibold text-[#68736e] print:hidden">
          Önce Salon ve masalar bölümünden masa ekleyin.
        </p>
      )}

      <div id="qr-print-area" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 print:grid-cols-2">
        {tables.map((table) => (
          <article
            key={table.id}
            className={`rounded-[22px] border border-[#dfe5e1] bg-white p-5 text-center print:break-inside-avoid print:rounded-none print:border-[color:var(--c-ink)] ${
              printId && printId !== table.id ? "print:hidden" : ""
            }`}
          >
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[color:var(--c-accent)]">{table.areaName}</p>
            <h3 className="mt-1 text-2xl font-black">{table.label}</h3>
            <div
              className="mx-auto mt-3 aspect-square w-full max-w-[220px] [&>svg]:size-full"
              role="img"
              aria-label={`${table.label} QR kodu`}
              dangerouslySetInnerHTML={{ __html: table.svg }}
            />
            <p className="mt-3 text-xs font-bold text-[#68736e]">Menü için kodu telefonunuzla okutun</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2 print:hidden">
              <button
                type="button"
                onClick={() => download(table)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-[color:var(--c-accent)] px-3 text-xs font-black text-white"
              >
                <Download size={14} /> İndir
              </button>
              <button
                type="button"
                onClick={() => printOne(table.id)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-[color:var(--c-ink)] px-3 text-xs font-black text-white"
              >
                <Printer size={14} /> Yazdır
              </button>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(table.url)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[#dfe5e1] px-3 text-xs font-black"
              >
                <Copy size={14} /> Kopyala
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => rotate(table.id, table.label)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[#dfe5e1] px-3 text-xs font-black"
              >
                <RefreshCcw size={14} /> Yenile
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
