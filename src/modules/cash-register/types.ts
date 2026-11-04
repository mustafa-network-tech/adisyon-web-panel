export type PaymentMethod = "cash" | "card";

export type CashSessionSummary = {
  openingMinor: number;
  cashMinor: number;
  cardMinor: number;
  refundMinor: number;
};
