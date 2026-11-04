import { describe, expect, it } from "vitest";
import { permissions, systemRoles } from "./permissions";

describe("authorization catalog", () => {
  it("keeps permission codes unique", () => {
    expect(new Set(permissions).size).toBe(permissions.length);
  });

  it("contains the critical financial permissions", () => {
    expect(permissions).toEqual(
      expect.arrayContaining([
        "payments.create",
        "payments.refund",
        "cash.open",
        "cash.close",
      ]),
    );
  });

  it("contains the default restaurant roles", () => {
    expect(systemRoles).toEqual(
      expect.arrayContaining(["owner", "manager", "waiter", "kitchen", "cashier"]),
    );
  });
});
