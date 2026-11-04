import { describe, expect, it } from "vitest";
import {
  invitationSchema,
  provisionTenantSchema,
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
      serviceChargePercent: "12.5",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.orderNumberPrefix).toBe("MK1");
      expect(result.data.serviceChargePercent).toBe(12.5);
    }
  });

  it("rejects invalid invitation and tenant slugs", () => {
    expect(invitationSchema.safeParse({ email: "wrong", roleId: "x", validHours: 999 }).success).toBe(false);
    expect(provisionTenantSchema.safeParse({
      name: "Test", legalName: "", slug: "Bad Slug", branchName: "Merkez",
      branchSlug: "merkez", ownerEmail: "owner@example.com", planCode: "PRO", status: "trial", endsAt: "", notes: "",
    }).success).toBe(false);
  });

  it("requires subscription end to follow its start", () => {
    const result = subscriptionSchema.safeParse({
      tenantId: "10000000-0000-4000-8000-000000000001",
      planCode: "PRO",
      status: "active",
      startsAt: "2026-11-04T10:00",
      endsAt: "2026-11-03T10:00",
      notes: "",
    });
    expect(result.success).toBe(false);
  });
});
