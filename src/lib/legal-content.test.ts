import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { company, companyLines, legalLinks } from "./legal";
import { legalDocuments } from "./legal-content";
import { supportMailto } from "./support";

describe("legal documents", () => {
  it("has the four documents, each linked in the footer and with its own page", () => {
    expect(legalDocuments.map((doc) => doc.slug).sort()).toEqual(["cerez-politikasi", "gizlilik-politikasi", "kullanim-kosullari", "kvkk-aydinlatma-metni"]);
    expect(legalLinks.map((link) => link.href).sort()).toEqual(legalDocuments.map((doc) => `/${doc.slug}`).sort());
    const pages = readdirSync("src/app/(legal)");
    for (const doc of legalDocuments) expect(pages).toContain(doc.slug);
  });

  it("is complete: every section has content and unique anchors", () => {
    for (const doc of legalDocuments) {
      expect(doc.description.length).toBeGreaterThan(40);
      const ids = doc.sections.map((section) => section.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const section of doc.sections) {
        expect(Boolean(section.paragraphs?.length || section.items?.length || section.table)).toBe(true);
      }
    }
  });

  it("names the contact address in every document and states the 7 day trial and the receipt disclaimer", () => {
    for (const doc of legalDocuments) expect(JSON.stringify(doc)).toContain("iletisim@mk-digitalsystems.com");
    const terms = JSON.stringify(legalDocuments.find((doc) => doc.slug === "kullanim-kosullari"));
    expect(terms).toContain("7 günlük deneme");
    expect(terms).toContain("mali değer taşımaz");
  });

  it("does not claim to collect card data and says it does not sell data", () => {
    const privacy = JSON.stringify(legalDocuments.find((doc) => doc.slug === "gizlilik-politikasi"));
    expect(privacy).toContain("kart numarası");
    expect(privacy).toContain("satmayız");
  });
});

describe("company and support details", () => {
  it("only shows company lines that are filled in", () => {
    expect(companyLines()).toEqual([company.name, `E-posta: ${company.email}`]);
  });

  it("builds a support mail with the business filled in", () => {
    const link = supportMailto({ business: "Lezzet", branch: "Merkez", user: "a@b.co" });
    expect(link.startsWith("mailto:iletisim@mk-digitalsystems.com?subject=")).toBe(true);
    expect(decodeURIComponent(link)).toContain("MK Adisyon destek - Lezzet");
    expect(decodeURIComponent(link)).toContain("Şube: Merkez");
    expect(supportMailto()).toContain("destek%20talebi");
  });
});
