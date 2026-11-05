import { describe, expect, it } from "vitest";
import type { KitchenTicket } from "@/modules/kitchen/types";
import { buildBillReceipt, buildKitchenReceipt, computeVatBreakdown } from "./builders";

const branding = { brandName: "Lezzet", branchName: "Merkez", footer: "Afiyet olsun" };

describe("receipt builders", () => {
  it("groups VAT per rate with per-line rounding", () => {
    const rows = computeVatBreakdown([
      { name: "Kebap", quantity: 2, unitPriceMinor: 36550, taxRate: 10 },
      { name: "Kola", quantity: 1, unitPriceMinor: 4000, taxRate: 20 },
      { name: "Ayran", quantity: 3, unitPriceMinor: 1500, taxRate: 10 },
    ]);
    expect(rows.map((row) => row.rate)).toEqual([10, 20]);
    // 10%: 73100 → 6645, 4500 → 409; 20%: 4000 → 667
    expect(rows[0]).toEqual({ rate: 10, netMinor: 77600 - 7054, vatMinor: 7054, grossMinor: 77600 });
    expect(rows[1]).toEqual({ rate: 20, netMinor: 3333, vatMinor: 667, grossMinor: 4000 });
  });

  it("builds a bill whose totals add up and clamps overpayment", () => {
    const bill = buildBillReceipt({
      orderNumber: 12,
      tableLabel: "Masa 4",
      openedAt: "2026-11-05T10:00:00Z",
      items: [{ name: "Çorba", quantity: 2, unitPriceMinor: 5500, taxRate: 10 }],
      paidMinor: 99999,
      branding,
    });
    expect(bill.totals?.totalMinor).toBe(11000);
    expect((bill.totals?.subtotalMinor ?? 0) + (bill.totals?.taxMinor ?? 0)).toBe(11000);
    expect(bill.totals?.paidMinor).toBe(11000);
    expect(bill.totals?.outstandingMinor).toBe(0);
    expect(bill.footer).toBe("Afiyet olsun");
    expect(bill.notice).toBeTruthy();
  });

  it("names the staff member and marks customer QR lines with the table", () => {
    const bill = buildBillReceipt({
      orderNumber: 3,
      tableLabel: "Masa 9",
      serverName: "Ayşe",
      openedAt: "2026-11-05T10:00:00Z",
      items: [
        { name: "Çorba", quantity: 1, unitPriceMinor: 5000, taxRate: 10 },
        { name: "Kola", quantity: 2, unitPriceMinor: 4000, taxRate: 20, source: "qr" },
      ],
      branding,
    });
    expect(bill.meta).toContainEqual({ label: "Garson", value: "Ayşe" });
    expect(bill.meta).toContainEqual({ label: "Müşteri (QR)", value: "Masa 9" });
    expect(bill.lines.map((line) => line.name)).toEqual(["Çorba", "Kola (QR)"]);
  });

  it("shows no waiter for a pure customer order", () => {
    const bill = buildBillReceipt({
      orderNumber: 4,
      tableLabel: "Masa 2",
      serverName: null,
      openedAt: "2026-11-05T10:00:00Z",
      items: [{ name: "Ayran", quantity: 1, unitPriceMinor: 1500, taxRate: 10, source: "qr" }],
      branding,
    });
    expect(bill.meta.some((row) => row.label === "Garson")).toBe(false);
    expect(bill.meta).toContainEqual({ label: "Müşteri (QR)", value: "Masa 2" });
  });

  it("computes VAT on the discounted amount, matching the database", () => {
    // Same order as the database smoke test: 10% adisyon discount on 81 100.
    const bill = buildBillReceipt({
      orderNumber: 1,
      tableLabel: "Masa 1",
      openedAt: "2026-11-05T10:00:00Z",
      items: [
        { name: "Kebap", quantity: 2, unitPriceMinor: 36550, taxRate: 10 },
        { name: "Kola", quantity: 2, unitPriceMinor: 4000, taxRate: 20 },
      ],
      discountMinor: 8110,
      discountReason: "ikram",
      branding,
    });
    expect(bill.totals?.discountMinor).toBe(8110);
    expect(bill.totals?.totalMinor).toBe(81100 - 8110);
    expect(bill.totals?.taxMinor).toBe(7181);
    expect((bill.totals?.subtotalMinor ?? 0) + (bill.totals?.taxMinor ?? 0)).toBe(bill.totals?.totalMinor);
  });

  it("marks discounted items with their list price", () => {
    const bill = buildBillReceipt({
      orderNumber: 2,
      tableLabel: "Masa 2",
      openedAt: "2026-11-05T10:00:00Z",
      items: [{ name: "Kebap", quantity: 1, unitPriceMinor: 18275, taxRate: 10, listUnitPriceMinor: 36550 }],
      branding,
    });
    expect(bill.lines[0].note).toMatch(/İndirimli \(liste/);
    expect(bill.totals?.discountMinor).toBe(0);
  });

  it("builds a kitchen receipt without prices", () => {
    const ticket: KitchenTicket = {
      id: "t1", orderId: "o1", orderNumber: 7, tableLabel: "Bahçe 2",
      stationId: "s1", stationName: "Mutfak", stationColor: "#e8623a",
      status: "new", sentAt: "2026-11-05T10:00:00Z", startedAt: null, readyAt: null,
      serverName: "Ayşe",
      items: [{ orderItemId: "i1", quantity: 2, name: "Lahmacun", options: ["Büyük", "Çıkar: Soğan"], note: "acısız" }],
    };
    const receipt = buildKitchenReceipt(ticket, branding);
    expect(receipt.kind).toBe("kitchen");
    expect(receipt.stationName).toBe("Mutfak");
    expect(receipt.lines).toEqual([{ quantity: 2, name: "Lahmacun", options: ["Büyük", "Çıkar: Soğan"], note: "acısız" }]);
    expect(receipt.totals).toBeUndefined();
  });
});
