import { formatMoney } from "@/lib/money";
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
  /** Option labels chosen for this line. */
  options?: string[];
  /** "qr" when the customer ordered it from the table QR menu. */
  source?: "staff" | "qr";
  /** Unit price before an item discount, when one was applied. */
  listUnitPriceMinor?: number | null;
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
 * VAT per rate for VAT-inclusive line totals. Without an adisyon discount it
 * rounds per line exactly like private.refresh_order_totals; with one, the
 * discount is shared across the rates and VAT is computed on what is left.
 * `grossMinor` is what the customer pays for that rate (after the discount).
 */
export function computeVatBreakdown(items: BillItem[], discountMinor = 0): VatRow[] {
  const byRate = new Map<number, { gross: number; vat: number }>();
  for (const item of items) {
    const gross = item.unitPriceMinor * item.quantity;
    const vat = Math.round((gross * item.taxRate) / (100 + item.taxRate));
    const current = byRate.get(item.taxRate) || { gross: 0, vat: 0 };
    byRate.set(item.taxRate, { gross: current.gross + gross, vat: current.vat + vat });
  }
  const grossTotal = [...byRate.values()].reduce((sum, value) => sum + value.gross, 0);
  const discount = Math.min(Math.max(discountMinor, 0), grossTotal);

  return [...byRate.entries()]
    .sort(([a], [b]) => a - b)
    .map(([rate, value]) => {
      if (discount === 0) {
        return { rate, netMinor: value.gross - value.vat, vatMinor: value.vat, grossMinor: value.gross };
      }
      const gross = value.gross - Math.round((discount * value.gross) / grossTotal);
      const vat = Math.round((gross * rate) / (100 + rate));
      return { rate, netMinor: gross - vat, vatMinor: vat, grossMinor: gross };
    });
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
      options: item.options,
      note: item.note,
    })),
  };
}

export function buildBillReceipt(input: {
  orderNumber: number;
  tableLabel: string;
  /** Staff member who took the order; null/undefined for pure QR orders. */
  serverName?: string | null;
  openedAt: string;
  items: BillItem[];
  /** Adisyon discount in minor units (0 or omitted for none). */
  discountMinor?: number;
  discountReason?: string | null;
  paidMinor?: number;
  branding: ReceiptBranding;
  printedAt?: Date;
}): ReceiptDocument {
  const discountMinor = Math.max(input.discountMinor ?? 0, 0);
  const vat = computeVatBreakdown(input.items, discountMinor);
  const totalMinor = vat.reduce((sum, row) => sum + row.grossMinor, 0);
  const taxMinor = vat.reduce((sum, row) => sum + row.vatMinor, 0);
  const paidMinor = Math.min(input.paidMinor ?? 0, totalMinor);
  const totals: ReceiptTotals = {
    vat,
    subtotalMinor: totalMinor - taxMinor,
    taxMinor,
    discountMinor: input.items.reduce((sum, item) => sum + item.unitPriceMinor * item.quantity, 0) - totalMinor,
    discountReason: input.discountReason ?? null,
    totalMinor,
    paidMinor,
    outstandingMinor: totalMinor - paidMinor,
  };

  const meta = [
    { label: "Masa", value: input.tableLabel },
    { label: "Sipariş", value: `#${input.orderNumber}` },
  ];
  if (input.serverName) meta.push({ label: "Garson", value: input.serverName });
  if (input.items.some((item) => item.source === "qr")) {
    meta.push({ label: "Müşteri (QR)", value: input.tableLabel });
  }
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
      name: item.source === "qr" ? `${item.name} (QR)` : item.name,
      options: item.options,
      note: [
        item.notes,
        item.listUnitPriceMinor ? `İndirimli (liste ${formatMoney(item.listUnitPriceMinor * item.quantity)})` : null,
      ].filter(Boolean).join(" · ") || null,
      unitPriceMinor: item.unitPriceMinor,
      totalMinor: item.unitPriceMinor * item.quantity,
    })),
    totals,
    footer: input.branding.footer,
    notice: "Mali değeri yoktur.",
  };
}
