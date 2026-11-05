import { describe, expect, it } from "vitest";
import { parseAreas, parseMenu, parsePriceMinor, parseStations, parseTables } from "./parse";
import { parsePlanParam, planForCode } from "./plans";
import {
  allStepsReady,
  deriveStatus,
  firstOpenStep,
  isAssistedOpen,
  platformNextStatuses,
  resolveStep,
  setupErrorMessage,
} from "./status";

describe("package parameter", () => {
  it("accepts only the three known package ids", () => {
    expect(parsePlanParam("baslangic")).toBe("START");
    expect(parsePlanParam("profesyonel")).toBe("PRO");
    expect(parsePlanParam("cok-subeli")).toBe("MULTI");
  });

  it("drops anything else instead of trusting the URL", () => {
    for (const value of ["PRO", "pro", "enterprise", "", "baslangic ", "../x", null, undefined]) {
      expect(parsePlanParam(value as string)).toBeNull();
    }
    expect(parsePlanParam(["profesyonel"])).toBeNull();
  });

  it("maps a code back to its price list entry", () => {
    expect(planForCode("PRO").name).toBe("Profesyonel");
  });
});

describe("status derivation", () => {
  const base = { status: "trial_ready" as const, trialStartedAt: null };
  const now = new Date("2027-01-10T12:00:00Z");

  it("shows the stored status while the trial has not started", () => {
    expect(deriveStatus(base, { status: "trial", endsAt: null }, now)).toBe("trial_ready");
  });

  it("is active during the 7 days and ended afterwards", () => {
    const started = { ...base, trialStartedAt: "2027-01-08T12:00:00Z" };
    expect(deriveStatus(started, { status: "trial", endsAt: "2027-01-15T12:00:00Z" }, now)).toBe("trial_active");
    expect(deriveStatus(started, { status: "trial", endsAt: "2027-01-10T11:00:00Z" }, now)).toBe("trial_ended");
  });

  it("an activated subscription wins", () => {
    const started = { ...base, trialStartedAt: "2027-01-01T12:00:00Z" };
    expect(deriveStatus(started, { status: "active", endsAt: "2027-06-01T00:00:00Z" }, now)).toBe("subscription_active");
  });
});

describe("steps", () => {
  it("finds the first open step and never lets the wizard jump ahead", () => {
    expect(firstOpenStep([])).toBe(1);
    expect(firstOpenStep(["areas", "tables"])).toBe(3);
    expect(firstOpenStep(["areas", "tables", "stations", "menu"])).toBe(4);
    const state = { currentStep: 3, completedSteps: ["areas" as const] };
    expect(resolveStep(4, state)).toBe(2);
    expect(resolveStep(1, state)).toBe(1);
    expect(resolveStep(null, state)).toBe(2);
    expect(resolveStep(0, state)).toBe(2);
  });

  it("is ready only when all four areas have data", () => {
    expect(allStepsReady({ areas: true, tables: true, stations: true, menu: true })).toBe(true);
    expect(allStepsReady({ areas: true, tables: true, stations: true, menu: false })).toBe(false);
  });
});

describe("platform transitions", () => {
  it("allows only the documented moves", () => {
    expect(platformNextStatuses("assisted_requested")).toEqual(["assisted_in_progress", "info_needed"]);
    expect(platformNextStatuses("setup_completed")).toContain("trial_ready");
    expect(platformNextStatuses("assisted_requested")).not.toContain("trial_ready");
    expect(platformNextStatuses("trial_ready")).toEqual([]);
    expect(platformNextStatuses("self_in_progress")).toEqual([]);
  });

  it("assisted setup is open only before the trial and before completion", () => {
    expect(isAssistedOpen("assisted_requested", "assisted", null)).toBe(true);
    expect(isAssistedOpen("assisted_in_progress", "assisted", "2027-01-01")).toBe(false);
    expect(isAssistedOpen("trial_ready", "assisted", null)).toBe(false);
    expect(isAssistedOpen("assisted_requested", "self", null)).toBe(false);
  });
});

describe("error messages", () => {
  it("translates database error codes and hides unknown ones", () => {
    expect(setupErrorMessage("trial_already_started")).toContain("zaten başlatıldı");
    expect(setupErrorMessage("some internal failure at line 12")).toBe("İşlem tamamlanamadı. Lütfen tekrar deneyin.");
    expect(setupErrorMessage(undefined)).toContain("tamamlanamadı");
  });
});

describe("line parsers", () => {
  it("parses halls", () => {
    expect(parseAreas("Salon\n  Teras \n\n")).toEqual({ ok: true, rows: ["Salon", "Teras"] });
    expect(parseAreas("  \n")).toMatchObject({ ok: false });
  });

  it("expands table ranges, labels and capacity", () => {
    const result = parseTables("Salon: Masa 1-3, VIP (6)\nTeras: T1, T2 (4)");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows.map((row) => `${row.area}/${row.label}/${row.capacity}`)).toEqual([
      "Salon/Masa 1/2",
      "Salon/Masa 2/2",
      "Salon/Masa 3/2",
      "Salon/VIP/6",
      "Teras/T1/2",
      "Teras/T2/4",
    ]);
  });

  it("names the broken line", () => {
    expect(parseTables("Masa 1, Masa 2")).toMatchObject({ ok: false, error: expect.stringContaining("Satır 1") });
    expect(parseTables("Salon: Masa 5-2")).toMatchObject({ ok: false });
    expect(parseTables("Salon: Masa 1 (0)")).toMatchObject({ ok: false });
  });

  it("parses stations with optional category routing", () => {
    expect(parseStations("Mutfak\nBar: İçecek, Tatlı")).toEqual({
      ok: true,
      rows: [{ name: "Mutfak", categories: [] }, { name: "Bar", categories: ["İçecek", "Tatlı"] }],
    });
  });

  it("parses prices in Turkish and plain formats", () => {
    expect(parsePriceMinor("365")).toBe(36500);
    expect(parsePriceMinor("365,50")).toBe(36550);
    expect(parsePriceMinor("1.250,00")).toBe(125000);
    expect(parsePriceMinor("12.5")).toBe(1250);
    expect(parsePriceMinor("₺45 TL")).toBe(4500);
    expect(parsePriceMinor("abc")).toBeNull();
    expect(parsePriceMinor("-5")).toBeNull();
    expect(parsePriceMinor("")).toBeNull();
  });

  it("parses menu rows with optional description and station", () => {
    const result = parseMenu("Yemek | Kebap | 365 | Odun ateşi | Mutfak\nİçecek | Çay | 25");
    expect(result).toEqual({
      ok: true,
      rows: [
        { category: "Yemek", name: "Kebap", price_minor: 36500, description: "Odun ateşi", station: "Mutfak" },
        { category: "İçecek", name: "Çay", price_minor: 2500 },
      ],
    });
    expect(parseMenu("Yemek | Kebap")).toMatchObject({ ok: false });
    expect(parseMenu("Yemek | Kebap | ücretsiz")).toMatchObject({ ok: false });
  });
});

