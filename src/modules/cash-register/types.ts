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
  paidMinor: number;
  outstandingMinor: number;
  items: CheckoutOrderItem[];
};

export type RecentPayment = {
  id: string;
  orderNumber: number;
  method: PaymentMethod;
  amountMinor: number;
  refundedMinor: number;
  paidAt: string;
};

export type CheckoutSnapshot = {
  registers: CashRegister[];
  sessions: CashSession[];
  orders: CheckoutOrder[];
  recentPayments: RecentPayment[];
  cashTotalMinor: number;
  cardTotalMinor: number;
  refundTotalMinor: number;
};

export type FinanceActionResult =
  | { ok: true; message: string }
  | { ok: false; code: string; message: string };
