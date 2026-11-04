import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";

function pngDimensions(relativePath: string) {
  const data = readFileSync(resolve(process.cwd(), "public", relativePath));
  expect(data.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

describe("PWA assets and cache boundary", () => {
  it("declares installable raster icons with exact dimensions", () => {
    const icons = manifest().icons || [];
    for (const icon of icons) {
      const expected = Number.parseInt(icon.sizes || "0", 10);
      const dimensions = pngDimensions(String(icon.src).replace(/^\//, ""));
      expect(dimensions).toEqual({ width: expected, height: expected });
    }
  });

  it("keeps navigation and authenticated data out of runtime caches", () => {
    const worker = readFileSync(resolve(process.cwd(), "public/sw.js"), "utf8");
    expect(worker).toContain('request.mode === "navigate"');
    expect(worker).toContain('url.pathname.startsWith("/_next/static/")');
    expect(worker).toContain('url.pathname.startsWith("/icons/")');
    expect(worker).not.toMatch(/caches\.open\([^)]*\)[\s\S]*\/api\//);
    expect(worker).not.toMatch(/caches\.open\([^)]*\)[\s\S]*\/app\//);
  });
});
