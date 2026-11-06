import { describe, expect, it } from "vitest";
import { subscriptionEnded } from "./subscription-time";

describe("subscription end of day (Europe/Istanbul)", () => {
  const endsAt = "2026-11-10T09:00:00Z"; // 10 Nov 12:00 Istanbul
  it("still works at 23:59:59 on the last day", () => {
    expect(subscriptionEnded(endsAt, new Date("2026-11-10T20:59:59Z"))).toBe(false);
  });
  it("ends at 00:00:00 the next day", () => {
    expect(subscriptionEnded(endsAt, new Date("2026-11-10T21:00:00Z"))).toBe(true);
  });
  it("is open ended without a date", () => {
    expect(subscriptionEnded(null)).toBe(false);
  });
});
