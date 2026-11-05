import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { defaultTheme, isTheme, resolveTheme, themes } from "./themes";

describe("themes", () => {
  it("offers exactly three themes starting with the default", () => {
    expect(themes.map((theme) => theme.id)).toEqual(["classic", "ocean", "burgundy"]);
    expect(themes[0].id).toBe(defaultTheme);
  });

  it("falls back to the default for unknown values", () => {
    expect(resolveTheme("ocean")).toBe("ocean");
    expect(resolveTheme("neon")).toBe(defaultTheme);
    expect(resolveTheme(undefined)).toBe(defaultTheme);
    expect(isTheme("burgundy")).toBe(true);
    expect(isTheme(5)).toBe(false);
  });

  it("has CSS variables defined for every non-default theme", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    for (const theme of themes.filter((item) => item.id !== defaultTheme)) {
      expect(css).toContain(`[data-theme="${theme.id}"]`);
    }
    expect(css).toMatch(/:root\s*{[^}]*--c-accent:/);
  });
});
