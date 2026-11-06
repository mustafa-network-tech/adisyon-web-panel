import { describe, expect, it } from "vitest";
import { joinDecisionErrorMessage, joinRequestErrorMessage, joinWaitingMessage, memberAccessErrorMessage, roleAssignmentRules, statusOptionsFor } from "./role-rules";

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

  it("explains join request errors", () => {
    expect(joinRequestErrorMessage("invalid_code")).toMatch(/katılım kodu hatalı/);
    expect(joinRequestErrorMessage("rate_limited")).toMatch(/Çok fazla/);
    expect(joinRequestErrorMessage(undefined)).toMatch(/tekrar deneyin/);
    expect(joinDecisionErrorMessage("join_request_already_decided")).toMatch(/zaten sonuçlandırılmış/);
    expect(joinDecisionErrorMessage("user_limit_reached")).toMatch(/kullanıcı sınırı/);
    expect(joinWaitingMessage).toMatch(/yöneticinizin onayını bekleyin/);
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
