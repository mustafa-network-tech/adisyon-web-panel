import type { KitchenTicket } from "@/modules/kitchen/types";
import type {
  ReceiptBranding,
  ReceiptDocument,
  ReceiptTotals,
  VatRow,
} from "./types";

export type BillItem = {
  name: string;
  quantity: number;
  unitPriceMinor: number;
  /** Percentage, e.g. 10 for 10%. Prices are VAT-inclusive. */
  taxRate: number;
  notes?: string | null;
};

const dateTimeFormatter = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatReceiptDate(value: string | Date) {
  return dateTimeFormatter.format(typeof value === "string" ? new Date(value) : value);
}

/**
 * VAT per rate for VAT-inclusive line totals. Rounds per line exactly like
 * private.refresh_order_totals, so the receipt always matches the stored order.
 */
export function computeVatBreakdown(items: BillItem[]): VatRow[] {
  const byRate = new Map<number, { gross: number; vat: number }>();
  for (const item of items) {
    const gross = item.unitPriceMinor * item.quantity;
    const vat = Math.round((gross * item.taxRate) / (100 + item.taxRate));
    const current = byRate.get(item.taxRate) || { gross: 0, vat: 0 };
    byRate.set(item.taxRate, { gross: current.gross + gross, vat: current.vat + vat });
  }
  return [...byRate.entries()]
    .sort(([a], [b]) => a - b)
    .map(([rate, value]) => ({
      rate,
      netMinor: value.gross - value.vat,
      vatMinor: value.vat,
      grossMinor: value.gross,
    }));
}

export function buildKitchenReceipt(
  ticket: KitchenTicket,
  branding: ReceiptBranding,
): ReceiptDocument {
  return {
    kind: "kitchen",
    title: "MUTFAK FİŞİ",
    brandName: branding.brandName,
    branchName: branding.branchName,
    stationName: ticket.stationName,
    meta: [
      { label: "Masa", value: ticket.tableLabel },
      { label: "Sipariş", value: `#${ticket.orderNumber}` },
      { label: "Garson", value: ticket.serverName },
      { label: "Saat", value: formatReceiptDate(ticket.sentAt) },
    ],
    lines: ticket.items.map((item) => ({
      quantity: item.quantity,
      name: item.name,
      note: item.note,
    })),
  };
}

export function buildBillReceipt(input: {
  orderNumber: number;
  tableLabel: string;
  serverName?: string;
  openedAt: string;
  items: BillItem[];
  paidMinor?: number;
  branding: ReceiptBranding;
  printedAt?: Date;
}): ReceiptDocument {
  const vat = computeVatBreakdown(input.items);
  const totalMinor = vat.reduce((sum, row) => sum + row.grossMinor, 0);
  const taxMinor = vat.reduce((sum, row) => sum + row.vatMinor, 0);
  const paidMinor = Math.min(input.paidMinor ?? 0, totalMinor);
  const totals: ReceiptTotals = {
    vat,
    subtotalMinor: totalMinor - taxMinor,
    taxMinor,
    totalMinor,
    paidMinor,
    outstandingMinor: totalMinor - paidMinor,
  };

  const meta = [
    { label: "Masa", value: input.tableLabel },
    { label: "Sipariş", value: `#${input.orderNumber}` },
  ];
  if (input.serverName) meta.push({ label: "Garson", value: input.serverName });
  meta.push({ label: "Açılış", value: formatReceiptDate(input.openedAt) });
  meta.push({ label: "Yazdırma", value: formatReceiptDate(input.printedAt ?? new Date()) });

  return {
    kind: "bill",
    title: "ADİSYON",
    brandName: input.branding.brandName,
    branchName: input.branding.branchName,
    meta,
    lines: input.items.map((item) => ({
      quantity: item.quantity,
      name: item.name,
      note: item.notes,
      unitPriceMinor: item.unitPriceMinor,
      totalMinor: item.unitPriceMinor * item.quantity,
    })),
    totals,
    footer: input.branding.footer,
    notice: "Mali değeri yoktur.",
  };
}
