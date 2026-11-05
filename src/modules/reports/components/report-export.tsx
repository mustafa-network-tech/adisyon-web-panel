"use client";

import { Download } from "lucide-react";
import type { SalesReport } from "../types";

const cell = (value: string | number) => {
  const text = String(value);
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const money = (minor: number) => (minor / 100).toFixed(2).replace(".", ",");

/** Excel-friendly CSV (semicolon separated, UTF-8 BOM) with the main report tables. */
export function buildReportCsv(report: SalesReport) {
  const { summary, payments } = report;
  const lines: string[][] = [
    ["Satış raporu", `${report.rangeStart} – ${report.rangeEnd}`],
    [],
    ["Özet"],
    ["Kapanan adisyon", String(summary.orderCount)],
    ["Brüt satış", money(summary.grossMinor)],
    ["Adisyon indirimi", money(summary.discountMinor)],
    ["Ürün indirimi", money(summary.itemDiscountMinor)],
    ["Net satış", money(summary.netMinor)],
    ["KDV", money(summary.taxMinor)],
    ["İptal edilen ürün tutarı", money(summary.voidMinor ?? 0)],
    ["İkram tutarı", money(summary.compMinor ?? 0)],
    ["Nakit tahsilat", money(payments.cashMinor)],
    ["Kart tahsilat", money(payments.cardMinor)],
    ["Nakit iade", money(payments.cashRefundMinor)],
    ["Kart iade", money(payments.cardRefundMinor)],
    [],
    ["Günlük satış"],
    ["Tarih", "Adisyon", "Net satış"],
    ...report.byDay.map((row) => [row.date, String(row.orderCount), money(row.netMinor)]),
    [],
    ["Ürünler"],
    ["Ürün", "Adet", "Tutar"],
    ...report.products.map((row) => [row.name, String(row.quantity), money(row.revenueMinor)]),
    [],
    ["Kategoriler"],
    ["Kategori", "Adet", "Tutar"],
    ...report.categories.map((row) => [row.name, String(row.quantity), money(row.revenueMinor)]),
    [],
    ["Personel"],
    ["Personel", "Adisyon", "Net satış"],
    ...report.staff.map((row) => [row.name, String(row.orderCount), money(row.netMinor)]),
  ];
  return "﻿" + lines.map((line) => line.map(cell).join(";")).join("\n");
}

export function ReportExport({ report }: { report: SalesReport }) {
  function download() {
    const blob = new Blob([buildReportCsv(report)], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `satis-raporu-${report.rangeStart}-${report.rangeEnd}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <button type="button" onClick={download} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#dce3df] bg-white px-4 text-sm font-black">
      <Download size={16} />Excel (CSV)
    </button>
  );
}
