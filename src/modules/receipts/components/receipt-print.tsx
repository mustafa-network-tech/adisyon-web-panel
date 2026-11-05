"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Printer } from "lucide-react";
import { formatMoney } from "@/lib/money";
import type { PaperWidth, ReceiptDocument } from "../types";

const storageKey = "mk-receipt-paper";
const paperListeners = new Set<() => void>();

function readPaperWidth(): PaperWidth {
  try {
    return window.localStorage.getItem(storageKey) === "58" ? 58 : 80;
  } catch {
    return 80;
  }
}

function subscribePaper(listener: () => void) {
  paperListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    paperListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** Paper width is a per-device preference (each device has its own printer). */
export function usePaperWidth() {
  const width = useSyncExternalStore(subscribePaper, readPaperWidth, () => 80 as PaperWidth);
  const setWidth = useCallback((next: PaperWidth) => {
    try {
      window.localStorage.setItem(storageKey, String(next));
    } catch {
      // Storage can be unavailable (private mode); the choice then lasts only for this print.
    }
    paperListeners.forEach((listener) => listener());
  }, []);
  return { width, setWidth };
}

export function PaperWidthSelect({ className = "" }: { className?: string }) {
  const { width, setWidth } = usePaperWidth();
  return (
    <label className={`inline-flex items-center gap-2 text-xs font-bold text-[#68736e] ${className}`}>
      <Printer size={14} />
      Fiş kağıdı
      <select
        value={width}
        onChange={(event) => setWidth(event.target.value === "58" ? 58 : 80)}
        className="min-h-9 rounded-lg border border-[#dce3df] bg-white px-2 text-xs font-bold"
      >
        <option value="80">80 mm</option>
        <option value="58">58 mm</option>
      </select>
    </label>
  );
}

/**
 * Renders a receipt into a print-only area and opens the browser print dialog.
 * Render `receiptArea` once in the page; call `print(document)` from buttons.
 */
export function useReceiptPrinter() {
  const { width } = usePaperWidth();
  const [document_, setDocument] = useState<ReceiptDocument | null>(null);

  useEffect(() => {
    if (!document_) return;
    const clear = () => setDocument(null);
    window.addEventListener("afterprint", clear);
    const frame = window.requestAnimationFrame(() => window.print());
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("afterprint", clear);
    };
  }, [document_]);

  const print = useCallback((next: ReceiptDocument) => setDocument(next), []);
  const receiptArea = document_
    ? createPortal(<ReceiptPrintArea document={document_} width={width} />, window.document.body)
    : null;
  return { print, receiptArea };
}

function ReceiptPrintArea({ document, width }: { document: ReceiptDocument; width: PaperWidth }) {
  const priced = document.kind === "bill";
  return (
    <div id="receipt-print-area" className={`receipt receipt-${width}`}>
      <style>{`@page { size: ${width}mm auto; margin: 0; }`}</style>
      <header className="receipt-center">
        <p className="receipt-brand">{document.brandName}</p>
        <p>{document.branchName}</p>
        <p className="receipt-title">{document.title}</p>
        {document.stationName && <p className="receipt-station">[{document.stationName}]</p>}
      </header>
      <dl className="receipt-meta">
        {document.meta.map((row) => (
          <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>
        ))}
      </dl>
      <hr />
      <ul className="receipt-lines">
        {document.lines.map((line, index) => (
          <li key={`${line.name}-${index}`}>
            <div className="receipt-line">
              <span className="receipt-qty">{line.quantity}x</span>
              <span className="receipt-name">{line.name}</span>
              {priced && line.totalMinor !== undefined && <span className="receipt-amount">{formatMoney(line.totalMinor)}</span>}
            </div>
            {line.note && <p className="receipt-note">Not: {line.note}</p>}
          </li>
        ))}
      </ul>
      {document.totals && (
        <>
          <hr />
          <div className="receipt-totals">
            {document.totals.vat.map((row) => (
              <div key={row.rate}><span>KDV %{row.rate} (matrah {formatMoney(row.netMinor)})</span><span>{formatMoney(row.vatMinor)}</span></div>
            ))}
            <div><span>Ara toplam</span><span>{formatMoney(document.totals.subtotalMinor)}</span></div>
            <div><span>KDV</span><span>{formatMoney(document.totals.taxMinor)}</span></div>
            <div className="receipt-grand"><span>TOPLAM</span><span>{formatMoney(document.totals.totalMinor)}</span></div>
            {document.totals.paidMinor > 0 && (
              <>
                <div><span>Ödenen</span><span>{formatMoney(document.totals.paidMinor)}</span></div>
                <div className="receipt-grand"><span>KALAN</span><span>{formatMoney(document.totals.outstandingMinor)}</span></div>
              </>
            )}
          </div>
        </>
      )}
      {(document.footer || document.notice) && (
        <footer className="receipt-center">
          <hr />
          {document.footer && <p>{document.footer}</p>}
          {document.notice && <p className="receipt-small">{document.notice}</p>}
        </footer>
      )}
    </div>
  );
}
