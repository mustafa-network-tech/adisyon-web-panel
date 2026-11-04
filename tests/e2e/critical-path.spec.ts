import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("public landing and sign-in remain usable by keyboard", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus-visible")).toBeVisible();

  await page.goto("/giris");
  await expect(page.getByRole("heading", { name: /giriş/i })).toBeVisible();
  await page.getByLabel(/e-posta/i).focus();
  await expect(page.getByLabel(/e-posta/i)).toBeFocused();
});

test("protected routes fail closed without a session", async ({ page }) => {
  await page.goto("/mk-admin");
  await expect(page).toHaveURL(/\/giris\?next=%2Fmk-admin$/);

  await page.goto("/app/demo/merkez/ayarlar/isletme");
  await expect(page).toHaveURL(/\/giris\?next=%2Fapp%2Fdemo%2Fmerkez%2Fayarlar%2Fisletme$/);
});

test("public entry screens have no serious accessibility violations", async ({ page }) => {
  for (const path of ["/", "/giris", "/offline"]) {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).analyze();
    const seriousViolations = results.violations.filter((item) =>
      item.impact === "serious" || item.impact === "critical",
    );
    expect(seriousViolations, `${path} accessibility violations`).toEqual([]);
  }
});

test("PWA manifest, worker and raster icons are available", async ({ request }) => {
  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBeTruthy();
  const manifest = await manifestResponse.json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ sizes: "192x192", type: "image/png" }),
    expect.objectContaining({ sizes: "512x512", type: "image/png" }),
    expect.objectContaining({ purpose: "maskable" }),
  ]));

  const workerResponse = await request.get("/sw.js");
  expect(workerResponse.ok()).toBeTruthy();
  expect(workerResponse.headers()["cache-control"]).toContain("no-store");

  for (const icon of manifest.icons) {
    const iconResponse = await request.get(icon.src);
    expect(iconResponse.ok()).toBeTruthy();
    expect(iconResponse.headers()["content-type"]).toBe("image/png");
  }
});

test("service worker serves the static fallback without caching private routes", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Service-worker lifecycle is viewport independent.");
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  const cachedUrls = await page.evaluate(async () => {
    const cacheNames = await caches.keys();
    const requests = await Promise.all(
      cacheNames.map(async (name) => (await caches.open(name)).keys()),
    );
    return requests.flat().map((request) => new URL(request.url).pathname);
  });
  expect(cachedUrls.some((url) => url.startsWith("/app/") || url.startsWith("/api/"))).toBe(false);

  await context.setOffline(true);
  await page.goto("/offline-kontrol", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Bağlantı kesildi" })).toBeVisible();
  await context.setOffline(false);
  await page.goto("/");
  await page.evaluate(async () => {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
    await Promise.all((await caches.keys()).map((name) => caches.delete(name)));
  });
});
