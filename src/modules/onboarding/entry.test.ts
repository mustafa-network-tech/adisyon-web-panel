import { describe, expect, it } from "vitest";
import { getSafeAuthCallbackPath } from "@/lib/auth/redirects";
import { entryQuery, parseEntry, setupLandingPath } from "./entry";

describe("entry choice from the call to action", () => {
  it("reads a valid package and the support hint", () => {
    expect(parseEntry({ paket: "profesyonel", kurulum: "destek" })).toEqual({ plan: "PRO", support: true });
    expect(parseEntry(new URLSearchParams("paket=cok-subeli"))).toEqual({ plan: "MULTI", support: false });
  });

  it("drops tampered values", () => {
    expect(parseEntry({ paket: "PRO", kurulum: "evet" })).toEqual({ plan: null, support: false });
    expect(parseEntry({ paket: ["profesyonel"] })).toEqual({ plan: null, support: false });
    expect(parseEntry({})).toEqual({ plan: null, support: false });
  });

  it("builds the query only from validated values", () => {
    expect(entryQuery({ plan: "PRO", support: true })).toBe("?paket=profesyonel&kurulum=destek");
    expect(entryQuery({ plan: null, support: true })).toBe("?kurulum=destek");
    expect(entryQuery({ plan: null, support: false })).toBe("");
  });

  it("lands on the setup page, with the support view when asked", () => {
    expect(setupLandingPath("acme", "merkez", { support: false })).toBe("/app/acme/merkez/kurulum");
    expect(setupLandingPath("acme", "merkez", { support: true })).toBe("/app/acme/merkez/kurulum?yontem=destek");
  });

  it("lets the e-mail confirmation callback return to onboarding with the hints, and nothing else", () => {
    expect(getSafeAuthCallbackPath("/baslangic?paket=profesyonel&kurulum=destek")).toBe("/baslangic?paket=profesyonel&kurulum=destek");
    expect(getSafeAuthCallbackPath("/baslangic?kurulum=destek")).toBe("/baslangic?kurulum=destek");
    expect(getSafeAuthCallbackPath("/baslangic?paket=baslangic")).toBe("/baslangic?paket=baslangic");
    expect(getSafeAuthCallbackPath("/baslangic?paket=x")).toBe("/giris");
    expect(getSafeAuthCallbackPath("/baslangic?next=https://evil.example")).toBe("/giris");
    expect(getSafeAuthCallbackPath("/baslangic/../giris")).toBe("/giris");
  });
});
