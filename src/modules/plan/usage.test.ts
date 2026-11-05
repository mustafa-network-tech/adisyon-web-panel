import { describe, expect, it } from "vitest";
import { daysLeft, isLimitReached, limitReachedMessage, planName, planPresets, usageText } from "./usage";

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
    expect(daysLeft("2026-11-12T10:00:00Z", now)).toBe(7);
    expect(daysLeft("2026-11-05T22:00:00Z", now)).toBe(1);
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
