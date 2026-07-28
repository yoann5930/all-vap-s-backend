import { chromium, devices } from "playwright";
import path from "node:path";
import fs from "node:fs";

const outDir = path.join(process.cwd(), "docs", "screenshots");
fs.mkdirSync(outDir, { recursive: true });

async function shot(page: import("playwright").Page, name: string) {
  const file = path.join(outDir, name);
  await page.screenshot({ path: file, fullPage: false });
  console.log("saved", file);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await desktop.newPage();

  await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(1500);
  await shot(page, "home-desktop.png");

  await page.goto("http://localhost:3000/boutique", { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(1500);
  await shot(page, "catalogue-desktop.png");

  await page.goto("http://localhost:3000/boutique?search=Liquidarom", {
    waitUntil: "networkidle",
    timeout: 120000,
  });
  await page.waitForTimeout(1500);
  await shot(page, "liquidarom-search.png");

  const first = page.locator('a[href^="/boutique/"]').first();
  if (await first.count()) {
    await first.click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1200);
    await shot(page, "product-page.png");
  }

  const mobile = await browser.newContext({
    ...devices["iPhone 12"],
  });
  const m = await mobile.newPage();
  await m.goto("http://localhost:3000/boutique", { waitUntil: "networkidle", timeout: 120000 });
  await m.waitForTimeout(1500);
  await shot(m, "catalogue-mobile.png");

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
