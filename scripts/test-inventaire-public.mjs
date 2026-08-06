import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const base = process.env.BASE || "https://mining-nancy-fantastic-porcelain.trycloudflare.com";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const log = [];
const say = (m) => { console.log(m); log.push(m); };

page.on("pageerror", (e) => say("PAGEERROR " + e.message));

await page.goto(base + "/inventaire", { waitUntil: "networkidle", timeout: 90000 });
await page.screenshot({ path: "/opt/cursor/artifacts/pw-inventaire-start.png", fullPage: true });

await page.getByPlaceholder("Prénom Nom").fill("Sophie Employe");
await page.getByText("All Vap's Hautmont").click();
const btn = page.getByRole("button", { name: /Commencer l'inventaire/i });
await page.waitForTimeout(400);
say("buttonDisabledAfterFill=" + (await btn.isDisabled()));
await btn.click({ timeout: 15000 });
await page.getByText(/Scan|code-barres/i).waitFor({ timeout: 15000 });
await page.screenshot({ path: "/opt/cursor/artifacts/pw-inventaire-session.png", fullPage: true });
say("sessionStarted=true");

await page.getByPlaceholder(/Scanner|EAN/i).fill("3760000000001");
await page.locator('input[type="number"]').fill("4");
await page.getByRole("button", { name: "Enregistrer" }).click();
await page.waitForTimeout(1500);
const line = await page.locator("ul li").first().innerText().catch(() => "NO_LINE");
say("line=" + line.replaceAll("\n", " | "));
await page.screenshot({ path: "/opt/cursor/artifacts/pw-inventaire-line.png", fullPage: true });

writeFileSync("/tmp/t.png", Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
));
const [chooser] = await Promise.all([
  page.waitForEvent("filechooser", { timeout: 5000 }).catch(() => null),
  page.getByRole("button", { name: "Photo" }).click(),
]);
if (chooser) {
  await chooser.setFiles("/tmp/t.png");
  await page.waitForTimeout(1500);
  say("photoUploaded=true");
} else say("photoUploaded=false");
await page.screenshot({ path: "/opt/cursor/artifacts/pw-inventaire-photo.png", fullPage: true });

const admin = await context.newPage();
await admin.goto(base + "/admin", { waitUntil: "networkidle", timeout: 90000 });
say("adminUrl=" + admin.url());
await admin.screenshot({ path: "/opt/cursor/artifacts/pw-admin-login.png", fullPage: true });

await page.goto(base + "/inventaire", { waitUntil: "networkidle" });
await page.getByPlaceholder("Prénom Nom").fill("Paul LQ");
await page.getByText("All Vap's Le Quesnoy").click();
await page.getByRole("button", { name: /Commencer/i }).click();
await page.waitForTimeout(1200);
say("lqVisible=" + (await page.getByText(/Le Quesnoy/).count()));
await page.screenshot({ path: "/opt/cursor/artifacts/pw-inventaire-lq.png", fullPage: true });

// API auth checks
const api = await page.request.get(base + "/api/admin/inventory/sessions");
say("adminApiStatus=" + api.status());

await browser.close();
writeFileSync("/opt/cursor/artifacts/pw-inventaire-report.txt", log.join("\n"));
