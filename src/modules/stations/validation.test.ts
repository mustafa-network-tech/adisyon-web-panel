import { describe, expect, it } from "vitest";
import { stationErrorMessage, stationInputSchema } from "./validation";

const base = { tenant: "t", branch: "b", stationId: "", name: "Izgara", color: "#e8623a", isActive: true, productIds: [] };

describe("station input", () => {
  it("accepts a station with a name, colour and products", () => {
    expect(stationInputSchema.safeParse(base).success).toBe(true);
    expect(stationInputSchema.safeParse({ ...base, productIds: ["10000000-0000-4000-8000-000000000001"] }).success).toBe(true);
  });

  it("rejects short names, bad colours and bad ids", () => {
    expect(stationInputSchema.safeParse({ ...base, name: "I" }).success).toBe(false);
    expect(stationInputSchema.safeParse({ ...base, color: "orange" }).success).toBe(false);
    expect(stationInputSchema.safeParse({ ...base, productIds: ["nope"] }).success).toBe(false);
  });

  it("explains errors, including the plan limit with the contact address", () => {
    expect(stationErrorMessage("last_station")).toMatch(/en az bir aktif istasyon/);
    expect(stationErrorMessage("station_limit_reached", 1)).toMatch(/\(1\).*iletisim@mk-digitalsystems\.com/);
    expect(stationErrorMessage("boom")).toBe("İstasyon kaydedilemedi.");
  });
});
