export type PaymentMethod = "cash" | "card";

export type CashRegister = {
  id: string;
  name: string;
};

export type CashSession = {
  id: string;
  cashRegisterId: string;
  cashRegisterName: string;
  openingMinor: number;
  openedAt: string;
  openedByName: string;
  expectedMinor: number;
};

export type CheckoutOrderItem = {
  id: string;
  name: string;
  quantity: number;
  allocatedQuantity: number;
  unitPriceMinor: number;
  taxRate: number;
  source: "staff" | "qr";
  listUnitPriceMinor: number | null;
  options: string[];
};

export type CheckoutOrder = {
  id: string;
  orderNumber: number;
  tableLabel: string;
  serverName: string;
  /** Staff member who opened the order; null for customer (QR) orders. */
  staffName: string | null;
  openedAt: string;
  totalMinor: number;
  /** Order level discount of an OLD bill, already deducted from totalMinor (such discounts no longer exist). */
  discountMinor: number;
  discountReason: string | null;
  /** Discount + promotion given at the cash desk so far (never money; settles part of the original total). */
  adjustedMinor: number;
  paidMinor: number;
  outstandingMinor: number;
  items: CheckoutOrderItem[];
};

export type CheckoutSnapshot = {
  registers: CashRegister[];
  sessions: CashSession[];
  orders: CheckoutOrder[];
  cashTotalMinor: number;
  cardTotalMinor: number;
  /** Discounts and promotions given in the open shifts: shown apart, not part of cash or card. */
  discountTotalMinor: number;
  promotionTotalMinor: number;
};

export type FinanceActionResult =
  | { ok: true; message: string }
  | { ok: false; code: string; message: string };
