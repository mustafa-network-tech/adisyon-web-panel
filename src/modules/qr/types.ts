export type PublicMenuProduct = {
  id: string;
  name: string;
  description: string | null;
  priceMinor: number;
  orderable: boolean;
};

export type PublicMenuCategory = {
  id: string;
  name: string;
  products: PublicMenuProduct[];
};

export type PublicMenu = {
  brandName: string;
  branchName: string;
  tableLabel: string;
  orderingEnabled: boolean;
  categories: PublicMenuCategory[];
};

export type QrTableEntry = {
  id: string;
  label: string;
  areaName: string;
  url: string;
  svg: string;
};

export type QrAdminSnapshot = {
  orderingEnabled: boolean;
  tables: Array<{
    id: string;
    label: string;
    areaName: string;
    qrToken: string;
  }>;
};

export type QrActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export type CustomerOrderResult =
  | { ok: true; orderNumber: number }
  | { ok: false; code: string; message: string };
