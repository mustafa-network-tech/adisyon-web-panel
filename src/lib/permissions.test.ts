import { describe, expect, it } from "vitest";
import {
  getWorkspaceHomeSegment,
  hasAnyPermission,
  permissions,
  systemRoles,
  workspaceSections,
} from "./permissions";

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

  it("routes users to the first section allowed by their permissions", () => {
    expect(getWorkspaceHomeSegment(["kitchen.read", "kitchen.update"])).toBe(
      "mutfak",
    );
    expect(getWorkspaceHomeSegment(["cash.open"])).toBe("kasa");
    expect(getWorkspaceHomeSegment([])).toBeNull();
  });

  it("checks navigation sections with any-of semantics", () => {
    expect(hasAnyPermission(["users.manage"], workspaceSections.settings)).toBe(
      true,
    );
    expect(hasAnyPermission(["tables.read"], workspaceSections.checkout)).toBe(
      false,
    );
  });
});
