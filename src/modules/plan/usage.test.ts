import { describe, expect, it } from "vitest";
import { addMonthsLocal, daysLeft, isLimitReached, isReadOnlyError, limitReachedMessage, localInputToIso, planName, planPresets, readOnlyBanner, readOnlyMessage, toLocalInput, usageText } from "./usage";

describe("plan usage", () => {
  it("writes usage with or without a limit", () => {
    expect(usageText(7, 15)).toBe("7 / 15");
    expect(usageText(40, null)).toBe("40 (sınırsız)");
  });

  it("knows when a limit is reached", () => {
    expect(isLimitReached(15, 15)).toBe(true);
    expect(isLimitReached(14, 15)).toBe(false);
    expect(isLimitReached(999, null)).toBe(false);
  });

  it("counts the days left of a trial", () => {
    const now = new Date("2026-11-05T10:00:00Z");
    expect(daysLeft("2026-11-12T10:00:00Z", now)).toBe(8); // 5..12 Nov, last day counts
    expect(daysLeft("2026-11-05T22:00:00Z", now)).toBe(2);
    expect(daysLeft("2026-11-05T18:00:00Z", now)).toBe(1);
    expect(daysLeft("2026-11-01T00:00:00Z", now)).toBe(0);
    expect(daysLeft(null, now)).toBeNull();
  });

  it("explains a reached limit with the contact address", () => {
    expect(limitReachedMessage("table", 15)).toMatch(/masa sınırına ulaştınız \(15\).*iletisim@mk-digitalsystems\.com/);
    expect(limitReachedMessage("station", 1)).toMatch(/mutfak istasyonu/);
  });

  it("matches the published plans", () => {
    expect(planName("pro")).toBe("Profesyonel");
    expect(planName("ÖZEL")).toBe("ÖZEL");
    expect(planPresets.START).toMatchObject({ userLimit: 5, tableLimit: 15, stationLimit: 1 });
    expect(planPresets.PRO).toMatchObject({ userLimit: 15, tableLimit: null });
    expect(planPresets.MULTI).toMatchObject({ userLimit: 40, branchLimit: 3 });
  });
});

describe("read-only mode", () => {
  it("recognises the database error and explains it with the contact address", () => {
    expect(isReadOnlyError("tenant_read_only")).toBe(true);
    expect(isReadOnlyError("something else")).toBe(false);
    expect(isReadOnlyError(undefined)).toBe(false);
    expect(readOnlyMessage).toMatch(/salt okunur.*iletisim@mk-digitalsystems\.com/);
  });

  it("words the banner for a trial and for a subscription", () => {
    expect(readOnlyBanner("trial")).toMatch(/^Deneme süreniz doldu/);
    expect(readOnlyBanner("active")).toMatch(/^Abonelik süreniz doldu/);
  });
});

describe("platform form dates", () => {
  it("adds whole months and keeps month ends sane", () => {
    expect(addMonthsLocal("2026-11-05T10:30", 1)).toBe("2026-12-05T10:30");
    expect(addMonthsLocal("2026-11-05T10:30", 12)).toBe("2027-11-05T10:30");
    expect(addMonthsLocal("2027-01-31T09:00", 1)).toBe("2027-02-28T09:00");
    expect(addMonthsLocal("nope", 1)).toBe("");
  });

  it("round-trips through the ISO instant the server stores", () => {
    const local = toLocalInput(new Date(2026, 10, 5, 14, 5));
    expect(local).toBe("2026-11-05T14:05");
    expect(new Date(localInputToIso(local)).getTime()).toBe(new Date(2026, 10, 5, 14, 5).getTime());
    expect(localInputToIso("")).toBe("");
  });
});
