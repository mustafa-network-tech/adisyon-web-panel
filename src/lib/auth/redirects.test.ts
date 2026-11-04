import { describe, expect, it } from "vitest";
import { getSafeAuthCallbackPath, getSafeReturnPath } from "./redirects";

describe("auth redirect allowlists", () => {
  it("accepts application-owned return paths", () => {
    expect(getSafeReturnPath("/mk-admin")).toBe("/mk-admin");
    expect(getSafeReturnPath("/app/acme/merkez/masalar?tab=salon")).toBe(
      "/app/acme/merkez/masalar?tab=salon",
    );
  });

  it("rejects external and unrelated return paths", () => {
    expect(getSafeReturnPath("https://evil.example")).toBeNull();
    expect(getSafeReturnPath("//evil.example")).toBeNull();
    expect(getSafeReturnPath("/giris")).toBeNull();
  });

  it("restricts auth callbacks to password update and onboarding", () => {
    expect(getSafeAuthCallbackPath("/baslangic")).toBe("/baslangic");
    expect(getSafeAuthCallbackPath("/sifre-guncelle")).toBe(
      "/sifre-guncelle",
    );
    expect(getSafeAuthCallbackPath("//evil.example")).toBe("/giris");
  });
});
