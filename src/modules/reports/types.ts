export type SalesReport = {
  rangeStart: string;
  rangeEnd: string;
  timezone: string;
  summary: {
    orderCount: number;
    guestCount: number;
    grossMinor: number;
    discountMinor: number;
    itemDiscountMinor: number;
    netMinor: number;
    taxMinor: number;
    averageMinor: number;
    cancelledCount: number;
  };
  payments: {
    cashMinor: number;
    cardMinor: number;
    cashRefundMinor: number;
    cardRefundMinor: number;
  };
  byDay: { date: string; orderCount: number; netMinor: number }[];
  byHour: { hour: number; orderCount: number; netMinor: number }[];
  products: { name: string; quantity: number; revenueMinor: number }[];
  categories: { name: string; quantity: number; revenueMinor: number }[];
  staff: { name: string; orderCount: number; netMinor: number }[];
  sessions: {
    registerName: string;
    openedAt: string;
    closedAt: string | null;
    openingMinor: number;
    expectedMinor: number;
    countedMinor: number | null;
    differenceMinor: number | null;
  }[];
};
