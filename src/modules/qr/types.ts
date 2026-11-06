import type { OptionGroup } from "@/modules/catalog/options";

export type PublicMenuProduct = {
  id: string;
  name: string;
  description: string | null;
  priceMinor: number;
  soldOut: boolean;
  /** Portion, extras and removals the waiter can add (shown to the guest for information). */
  optionGroups: OptionGroup[];
};

export type PublicMenuCategory = {
  id: string;
  name: string;
  products: PublicMenuProduct[];
};

export type PublicMenu = {
  brandName: string;
  /** Business colour theme ("classic", "ocean", "burgundy"). */
  theme?: string;
  branchName: string;
  tableLabel: string;
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
