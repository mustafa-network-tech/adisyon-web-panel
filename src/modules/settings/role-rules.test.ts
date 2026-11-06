import { describe, expect, it } from "vitest";
import { invitationAcceptErrorMessage, memberAccessErrorMessage, roleAssignmentRules, statusOptionsFor } from "./role-rules";

describe("role assignment rules", () => {
  it("explains database errors in Turkish", () => {
    expect(memberAccessErrorMessage("cannot_change_own_roles")).toMatch(/Kendi rolünüzü/);
    expect(memberAccessErrorMessage("last_owner_required")).toMatch(/Son işletme sahibi/);
    expect(memberAccessErrorMessage("something else")).toMatch(/kontrol edin/);
    expect(memberAccessErrorMessage(undefined)).toMatch(/kontrol edin/);
  });

  it("explains why a branch manager cannot reactivate a suspended member", () => {
    expect(memberAccessErrorMessage("reactivation_requires_tenant_scope")).toMatch(/şirket yöneticisi yeniden etkinleştirebilir/);
    expect(memberAccessErrorMessage("42501: role_exceeds_actor_permissions")).toMatch(/yetkilerinizi aşan/);
    expect(memberAccessErrorMessage("member_outside_actor_branches")).toMatch(/kendi şubelerinizdeki/);
  });

  it("explains invitation acceptance errors", () => {
    expect(invitationAcceptErrorMessage("membership_suspended")).toMatch(/askıya alınmış/);
    expect(invitationAcceptErrorMessage("invitation_inviter_inactive")).toMatch(/artık işletmede aktif değil/);
    expect(invitationAcceptErrorMessage("invitation_not_available")).toMatch(/geçersiz, süresi dolmuş/);
    expect(invitationAcceptErrorMessage("invitation_email_mismatch")).toMatch(/başka bir e-posta/);
    expect(invitationAcceptErrorMessage("something else")).toMatch(/Oturum e-postası/);
    expect(invitationAcceptErrorMessage(undefined)).toMatch(/Oturum e-postası/);
  });

  it("does not offer reactivation to branch-scope managers", () => {
    expect(statusOptionsFor("suspended", false)).toEqual(["suspended"]);
    expect(statusOptionsFor("suspended", true)).toContain("active");
    expect(statusOptionsFor("active", false)).toEqual(["active", "suspended", "invited"]);
    expect(statusOptionsFor("active", true)).toContain("suspended");
  });

  it("lists the rules shown to administrators", () => {
    expect(roleAssignmentRules.length).toBeGreaterThanOrEqual(6);
    expect(roleAssignmentRules.some((rule) => /yeniden etkinleştirebilir/.test(rule))).toBe(true);
  });
});
