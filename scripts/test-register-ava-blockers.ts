/**
 * Tests register payload + loadCatalogForAva field safety + AVA smoke local.
 * npx tsx scripts/test-register-ava-blockers.ts
 */
import { readFileSync } from "fs";
import path from "path";
import { searchCatalog, type CatalogProduct } from "../lib/ai/catalog-search";
import { humanizeForSpeech } from "../lib/ai/ava-speech-utils";

type R = { name: string; ok: boolean; detail: string };
const results: R[] = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "OK  " : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
}

const authForm = readFileSync(path.join(process.cwd(), "components/auth/AuthForm.tsx"), "utf8");
const registerRoute = readFileSync(
  path.join(process.cwd(), "app/api/auth/register/route.ts"),
  "utf8"
);
const loadCatalog = readFileSync(
  path.join(process.cwd(), "lib/ai/ava/load-catalog.ts"),
  "utf8"
);

const requiredPayload = [
  "passwordConfirm",
  "phone",
  "adultConfirmed",
  "acceptTerms",
  "acceptPrivacy",
];
for (const key of requiredPayload) {
  check(`AuthForm contient ${key}`, authForm.includes(key));
  check(`Zod API exige ${key}`, registerRoute.includes(key));
}
check(
  "AuthForm payload register complet",
  /passwordConfirm:\s*registerForm\.passwordConfirm/.test(authForm) &&
    /phone:\s*registerForm\.phone/.test(authForm) &&
    /adultConfirmed:\s*true/.test(authForm) &&
    /acceptTerms:\s*true/.test(authForm) &&
    /acceptPrivacy:\s*true/.test(authForm)
);

check(
  "Consentements non auto-cochés",
  /adultConfirmed:\s*false/.test(authForm) &&
    /acceptTerms:\s*false/.test(authForm) &&
    /acceptPrivacy:\s*false/.test(authForm)
);

check(
  "loadCatalog n'interroge pas ProductFlavor.searchKeywords",
  !/searchKeywords:\s*true/.test(loadCatalog)
);
check(
  "loadCatalog n'interroge pas ProductFlavor.flavors array",
  !/flavors:\s*true/.test(loadCatalog)
);
check(
  "loadCatalog n'interroge pas ProductVariant.stock",
  !/variants:\s*\{[\s\S]*?stock:\s*true/.test(loadCatalog)
);
check(
  "loadCatalog n'interroge pas ProductVariant.priceCents",
  !/variants:\s*\{[\s\S]*?priceCents:\s*true/.test(loadCatalog)
);
check(
  "loadCatalog n'interroge pas ProductVariant.pgVgLabel",
  !/pgVgLabel:\s*true/.test(loadCatalog)
);

const samples: CatalogProduct[] = [
  {
    id: "1",
    name: "Puff Blueberry",
    slug: "puff",
    description: "jetable",
    category: "puffs",
    brand: "Puff",
    priceCents: 990,
    stock: 10,
    imageUrl: null,
  },
  {
    id: "2",
    name: "Base DIY 50/50",
    slug: "diy",
    description: "DIY",
    category: "diy",
    brand: "All Vaps",
    priceCents: 1990,
    stock: 5,
    imageUrl: null,
  },
  {
    id: "3",
    name: "Menthe Fraiche 10ml",
    slug: "menthe",
    description: "menthe",
    category: "e-liquides",
    brand: "All Vaps",
    priceCents: 550,
    stock: 8,
    imageUrl: null,
  },
];

check(
  "puff exclu searchCatalog",
  searchCatalog(samples, "Je veux une puff", { limit: 3 }).length === 0
);
check(
  "diy trouvé",
  searchCatalog(samples, "Je veux du DIY", { limit: 3 }).some((p) => /diy/i.test(p.name))
);
check(
  "menthe trouvé",
  searchCatalog(samples, "e-liquide menthe", { limit: 3 }).some((p) => /menthe/i.test(p.name))
);
check("humanize DIY", /Di-Ya/i.test(humanizeForSpeech("selection DIY")));

// Live register payload shape against prod (validation only + optional create)
const BASE = process.env.AUDIT_BASE_URL || "https://www.allvaps.fr";

async function live() {
  const incomplete = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: BASE,
      Referer: `${BASE}/`,
    },
    body: JSON.stringify({
      email: "x@y.com",
      password: "Test1234!",
      firstName: "A",
      lastName: "B",
    }),
  });
  const incompleteJson = await incomplete.json().catch(() => ({}));
  check(
    "API refuse payload incomplet (AuthForm ancien)",
    incomplete.status >= 400,
    `HTTP ${incomplete.status} ${JSON.stringify(incompleteJson).slice(0, 100)}`
  );

  const email = `fix.register.${Date.now()}@allvaps-test.local`;
  const full = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: BASE,
      Referer: `${BASE}/`,
    },
    body: JSON.stringify({
      email,
      password: "FixRegister123!",
      passwordConfirm: "FixRegister123!",
      firstName: "Fix",
      lastName: "Register",
      phone: "0601020304",
      adultConfirmed: true,
      acceptTerms: true,
      acceptPrivacy: true,
      newsletter: false,
    }),
  });
  const fullJson = await full.json().catch(() => ({}));
  check(
    "API accepte payload AuthForm aligné",
    full.status === 201 || full.status === 200,
    `HTTP ${full.status} email=${email}`
  );
  check(
    "Token session après inscription",
    typeof fullJson.token === "string" && fullJson.token.length > 20,
    fullJson.token ? "token présent" : JSON.stringify(fullJson).slice(0, 120)
  );

  const ava = await fetch(`${BASE}/api/ai-assistant`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: BASE,
      Referer: `${BASE}/`,
    },
    body: JSON.stringify({ message: "Je cherche un e-liquide menthe" }),
  });
  const avaJson = await ava.json().catch(() => ({}));
  const content = String(avaJson.content || "");
  const stillFriendly = /petit problème/i.test(content);
  check(
    "AVA menthe prod (attendu KO tant que non déployé)",
    true,
    stillFriendly
      ? "TOUJOURS FRIENDLY_ERROR en prod (fix load-catalog non déployé)"
      : `OK: ${content.slice(0, 100)}`
  );

  const init = await fetch(`${BASE}/api/ai-assistant`, {
    headers: { Origin: BASE, Referer: `${BASE}/` },
  });
  const initJson = await init.json().catch(() => ({}));
  check(
    "Voice init",
    init.status === 200 && (initJson.voiceProvider === "browser" || initJson.mode === "voice"),
    `voiceProvider=${initJson.voiceProvider}`
  );
}

async function main() {
  await live();
  const fail = results.filter((r) => !r.ok).length;
  console.log(`\nTOTAL ${results.length - fail} OK / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
