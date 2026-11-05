/**
 * Printer-independent receipt model. The browser renderer uses it today; an
 * ESC/POS bridge or a cash-register (yazarkasa) adapter can consume the same
 * document later without touching the builders.
 */
export type PaperWidth = 58 | 80;

export type ReceiptKind = "kitchen" | "bill";

export type ReceiptLine = {
  quantity: number;
  name: string;
  note?: string | null;
  unitPriceMinor?: number;
  totalMinor?: number;
};

export type VatRow = {
  rate: number;
  /** Net amount (total minus VAT) for this rate. */
  netMinor: number;
  vatMinor: number;
  grossMinor: number;
};

export type ReceiptTotals = {
  vat: VatRow[];
  subtotalMinor: number;
  taxMinor: number;
  /** Adisyon discount (already deducted from totalMinor). */
  discountMinor: number;
  discountReason: string | null;
  totalMinor: number;
  paidMinor: number;
  outstandingMinor: number;
};

export type ReceiptDocument = {
  kind: ReceiptKind;
  title: string;
  brandName: string;
  branchName: string;
  stationName?: string;
  meta: { label: string; value: string }[];
  lines: ReceiptLine[];
  totals?: ReceiptTotals;
  footer?: string | null;
  /** Shown at the bottom, e.g. that a bill is not a fiscal document. */
  notice?: string;
};

export type ReceiptBranding = {
  brandName: string;
  branchName: string;
  footer: string | null;
};
