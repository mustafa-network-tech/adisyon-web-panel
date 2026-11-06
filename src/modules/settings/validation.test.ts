import { describe, expect, it } from "vitest";
import {
  joinDecisionSchema,
  subscriptionSchema,
  tenantConfigurationSchema,
} from "./validation";

describe("settings and platform validation", () => {
  it("normalizes tenant settings and service charge", () => {
    const result = tenantConfigurationSchema.safeParse({
      tenantName: "MK Restoran",
      legalName: "",
      branchName: "Merkez",
      brandName: "MK",
      primaryColor: "#E8623A",
      orderNumberPrefix: "mk1",
      receiptFooter: "Teşekkürler",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.orderNumberPrefix).toBe("MK1");
    }
  });

  it("rejects invalid join decisions", () => {
    expect(joinDecisionSchema.safeParse({ requestId: "x", decision: "approve", branchIds: [] }).success).toBe(false);
    expect(joinDecisionSchema.safeParse({ requestId: "11111111-1111-4111-8111-111111111111", decision: "maybe", branchIds: [] }).success).toBe(false);
    expect(joinDecisionSchema.safeParse({ requestId: "11111111-1111-4111-8111-111111111111", decision: "reject", branchIds: [] }).success).toBe(true);
  });

  it("requires subscription end to follow its start", () => {
    const result = subscriptionSchema.safeParse({
      tenantId: "10000000-0000-4000-8000-000000000001",
      planCode: "PRO",
      status: "active",
      startsAt: "2026-11-04T10:00",
      endsAt: "2026-11-03T10:00",
      notes: "",
      userLimit: 5,
      branchLimit: 1,
    });
    expect(result.success).toBe(false);
  });
});
