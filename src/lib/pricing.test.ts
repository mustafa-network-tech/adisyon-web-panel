import { describe, expect, it } from "vitest";
import {
  formatTl,
  includedInAllPlans,
  isLaunchCampaignActive,
  launchDeadlineText,
  pricingPlans,
} from "./pricing";

describe("price list", () => {
  it("matches the published launch and regular prices", () => {
    expect(pricingPlans.map((plan) => [plan.name, plan.launchPrice, plan.regularPrice])).toEqual([
      ["Başlangıç", 229, 449],
      ["Profesyonel", 449, 749],
      ["Çok Şubeli", 799, 1249],
    ]);
  });

  it("features exactly one plan and always discounts the launch price", () => {
    expect(pricingPlans.filter((plan) => plan.featured).map((plan) => plan.name)).toEqual(["Profesyonel"]);
    for (const plan of pricingPlans) expect(plan.launchPrice).toBeLessThan(plan.regularPrice);
  });

  it("states plan limits that the product enforces or that are plain terms", () => {
    const text = pricingPlans.map((plan) => plan.features.join("|")).join("|");
    expect(text).toContain("En fazla 5 personel hesabı");
    expect(text).toContain("En fazla 15 personel hesabı");
    expect(text).toContain("En fazla 40 personel hesabı");
    // No promise of features the product does not have yet.
    expect(text).not.toMatch(/karşılaştırma|merkezden menü|yönetim ekranı/i);
    expect(includedInAllPlans.join("|")).not.toMatch(/onayına/);
  });
});

describe("formatting", () => {
  it("writes Turkish thousands separators", () => {
    expect(formatTl(229)).toBe("229 TL");
    expect(formatTl(1249)).toBe("1.249 TL");
  });

  it("names the deadline", () => {
    expect(launchDeadlineText()).toBe("30 Nisan 2027");
  });
});

describe("campaign window", () => {
  it("is open through the deadline day in Turkey and closed after", () => {
    expect(isLaunchCampaignActive(new Date("2026-11-05T10:00:00Z"))).toBe(true);
    expect(isLaunchCampaignActive(new Date("2027-04-30T20:59:00Z"))).toBe(true); // 23:59 Turkey
    expect(isLaunchCampaignActive(new Date("2027-04-30T21:00:00Z"))).toBe(false); // 00:00 on 1 May Turkey
    expect(isLaunchCampaignActive(new Date("2027-06-01T00:00:00Z"))).toBe(false);
  });
});
