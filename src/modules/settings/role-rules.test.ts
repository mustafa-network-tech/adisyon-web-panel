import { describe, expect, it } from "vitest";
import { memberAccessErrorMessage, roleAssignmentRules } from "./role-rules";

describe("role assignment rules", () => {
  it("explains database errors in Turkish", () => {
    expect(memberAccessErrorMessage("cannot_change_own_roles")).toMatch(/Kendi rolünüzü/);
    expect(memberAccessErrorMessage("last_owner_required")).toMatch(/Son işletme sahibi/);
    expect(memberAccessErrorMessage("something else")).toMatch(/kontrol edin/);
    expect(memberAccessErrorMessage(undefined)).toMatch(/kontrol edin/);
  });

  it("lists the rules shown to administrators", () => {
    expect(roleAssignmentRules.length).toBeGreaterThanOrEqual(6);
  });
});
