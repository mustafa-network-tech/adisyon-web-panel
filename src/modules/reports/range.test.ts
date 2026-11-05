import { describe, expect, it } from "vitest";
import { buildReportCsv } from "./components/report-export";
import { resolveRange } from "./range";
import type { SalesReport } from "./types";

describe("report range", () => {
  const today = "2026-11-05"; // Thursday

  it("resolves presets", () => {
    expect(resolveRange({ preset: "today" }, today)).toEqual([today, today]);
    expect(resolveRange({ preset: "yesterday" }, today)).toEqual(["2026-11-04", "2026-11-04"]);
    expect(resolveRange({ preset: "last7" }, today)).toEqual(["2026-10-30", today]);
    expect(resolveRange({ preset: "week" }, today)).toEqual(["2026-11-02", today]);
    expect(resolveRange({ preset: "month" }, today)).toEqual(["2026-11-01", today]);
  });

  it("accepts a valid custom range and falls back to today otherwise", () => {
    expect(resolveRange({ from: "2026-10-01", to: "2026-10-31" }, today)).toEqual(["2026-10-01", "2026-10-31"]);
    expect(resolveRange({ from: "2026-10-31", to: "2026-10-01" }, today)).toEqual([today, today]);
    expect(resolveRange({ from: "nope", to: "2026-10-01" }, today)).toEqual([today, today]);
    expect(resolveRange({}, today)).toEqual([today, today]);
  });
});

describe("report csv", () => {
  it("writes Turkish decimals, escapes separators and starts with a BOM", () => {
    const report = {
      rangeStart: "2026-11-05",
      rangeEnd: "2026-11-05",
      summary: { orderCount: 1, grossMinor: 12000, discountMinor: 2000, itemDiscountMinor: 0, netMinor: 10000, taxMinor: 1500 },
      payments: { cashMinor: 10000, cardMinor: 0, cashRefundMinor: 0, cardRefundMinor: 0 },
      byDay: [{ date: "2026-11-05", orderCount: 1, netMinor: 10000 }],
      products: [{ name: "Ayran; büyük", quantity: 3, revenueMinor: 12000 }],
      categories: [],
      staff: [],
    } as unknown as SalesReport;
    const csv = buildReportCsv(report);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("Net satış;100,00");
    expect(csv).toContain('"Ayran; büyük";3;120,00');
  });
});
