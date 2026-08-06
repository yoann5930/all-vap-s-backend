import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const base =
  process.env.BASE ||
  "https://conviction-evanescence-acknowledged-select.trycloudflare.com";
const txt = readFileSync(".local/inventory-user-credentials.txt", "utf8");
function cred(name) {
  const block = txt.split("---").find((b) => b.toLowerCase().includes(name)) || "";
  const email = (block.match(/Email\s*:\s*(\S+)/) || [])[1];
  const password = (block.match(/MDP tmp\s*:\s*(.+)/) || [])[1]?.trim();
  return { email, password };
}
const aurelien = cred("aurelien");
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
page.on("console", (m) => {
  if (m.type() === "error") console.log("console_error", m.text());
});

await page.goto(base + "/inventaire", { waitUntil: "networkidle", timeout: 90000 });
await page.waitForURL(/login/, { timeout: 20000 });
console.log("redirectLogin", true);

await page.getByLabel("Email").fill(aurelien.email);
await page.getByLabel("Mot de passe").fill(aurelien.password);

const [loginRes] = await Promise.all([
  page.waitForResponse((r) => r.url().includes("/api/auth/login") && r.request().method() === "POST"),
  page.getByRole("button", { name: /^Se connecter$/i }).click(),
]);
console.log("loginStatus", loginRes.status());
const loginJson = await loginRes.json().catch(() => ({}));
console.log("loginRole", loginJson.user?.role, "mustChange", loginJson.user?.mustChangePassword);

await page.waitForTimeout(1500);
console.log("url1", page.url());

if (page.url().includes("changer-mot-de-passe")) {
  const pwds = page.locator('input[type="password"]');
  await pwds.nth(0).fill(aurelien.password);
  await pwds.nth(1).fill("AurelienPlay9!");
  await pwds.nth(2).fill("AurelienPlay9!");
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/auth/change-password")),
    page.getByRole("button", { name: /Enregistrer/i }).click(),
  ]);
  await page.waitForURL(/inventaire/, { timeout: 20000 });
}

if (page.url().includes("/login")) {
  const err = await page.locator(".text-red-700, .text-red-600").first().textContent().catch(() => "");
  console.log("loginError", err);
  await page.screenshot({ path: "/opt/cursor/artifacts/pw-auth-login-fail.png", fullPage: true });
  process.exit(1);
}

await page.waitForURL(/inventaire/, { timeout: 20000 }).catch(() => undefined);
console.log("onInventaire", page.url().includes("/inventaire"));
await page.screenshot({ path: "/opt/cursor/artifacts/pw-auth-inventaire-home.png", fullPage: true });

await page.getByText("All Vap's Hautmont").click({ timeout: 10000 });
await page.getByRole("button", { name: /Commencer/i }).click();
await page.getByText(/Scan|code-barres/i).waitFor({ timeout: 15000 });
await page.getByPlaceholder(/Scanner|EAN/i).fill("3760000000001");
await page.locator('input[type="number"]').fill("3");
await page.getByRole("button", { name: "Enregistrer" }).click();
await page.waitForTimeout(1500);
const line = await page.locator("ul li").first().innerText().catch(() => "NO");
console.log("line", line.replaceAll("\n", " | "));
await page.screenshot({ path: "/opt/cursor/artifacts/pw-auth-inventaire.png", fullPage: true });

await page.goto(base + "/admin", { waitUntil: "networkidle" });
console.log("adminUrl", page.url());
await page.screenshot({ path: "/opt/cursor/artifacts/pw-auth-admin-blocked.png", fullPage: true });
await browser.close();
console.log("PW_OK");
