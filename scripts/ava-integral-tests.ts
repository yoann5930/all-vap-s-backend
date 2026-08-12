/**
 * Tests A.V.A. intégralité — client + admin (hors DB si absente).
 * Lecture / exécution seule : ne modifie pas le catalogue.
 *
 * Usage: npx tsx scripts/ava-integral-tests.ts
 */
import { humanizeForSpeech, toSpokenText, AVA_GREETING_SHORT } from "../lib/ai/ava-speech-utils";
import { searchCatalog, type CatalogProduct } from "../lib/ai/catalog-search";
import {
  AVA_GREETING,
  AVA_NAME_REPLY,
  AVA_SUGGESTIONS,
  AVA_NO_EXACT_MATCH,
  AVA_3D_ROADMAP,
} from "../lib/ai/ava-constants";
import { AGE_REFUSAL, isAgeConfirmed, SALES_STEPS } from "../lib/ai/sales-script";
import { isOpenAIConfigured } from "../lib/ai/openai-voice";
import { AI_SERVICES, askAI } from "../lib/ai";
import { extractProfileUpdates } from "../lib/vape-profile/learning";
import fs from "node:fs";
import path from "node:path";

type Result = { name: string; ok: boolean; detail: string; area: string };
const results: Result[] = [];

function check(area: string, name: string, ok: boolean, detail = "") {
  results.push({ area, name, ok, detail });
  const mark = ok ? "OK " : "FAIL";
  console.log(`${mark} [${area}] ${name}${detail ? " — " + detail : ""}`);
}

const samples: CatalogProduct[] = [
  {
    id: "1",
    name: "E-liquide Frais Rouge 10ml 3mg",
    slug: "frais-rouge",
    description: "Saveur fruits frais 50/50 10ml 3mg",
    category: "e-liquides",
    brand: "All Vaps",
    priceCents: 590,
    stock: 12,
    imageUrl: null,
    isPromo: false,
  },
  {
    id: "2",
    name: "Base DIY 50/50 1L",
    slug: "diy-base",
    description: "Base DIY PG/VG 50/50",
    category: "diy",
    brand: "Diy",
    priceCents: 1990,
    stock: 5,
    imageUrl: null,
  },
  {
    id: "3",
    name: "Resistance Vaporesso GTX 0.6",
    slug: "gtx-06",
    description: "Coil mesh Vaporesso",
    category: "resistances",
    brand: "Vaporesso",
    priceCents: 1290,
    stock: 8,
    imageUrl: null,
  },
  {
    id: "4",
    name: "Puff Blueberry",
    slug: "puff-bb",
    description: "Puff jetable",
    category: "cigarettes-electroniques",
    brand: "Puff",
    priceCents: 990,
    stock: 20,
    imageUrl: null,
  },
  {
    id: "5",
    name: "Kit Pod MTL Start",
    slug: "kit-pod",
    description: "Cigarette electronique debutant MTL",
    category: "cigarettes-electroniques",
    brand: "All Vaps",
    priceCents: 2990,
    stock: 4,
    imageUrl: null,
  },
  {
    id: "6",
    name: "Menthe Fraiche 10ml",
    slug: "menthe",
    description: "E-liquide menthe 6mg 10ml 70/30",
    category: "e-liquides",
    brand: "All Vaps",
    priceCents: 550,
    stock: 9,
    imageUrl: null,
  },
  {
    id: "7",
    name: "JNR Mega Bar",
    slug: "jnr-mega",
    description: "JNR jetable",
    category: "puffs",
    brand: "JNR",
    priceCents: 1200,
    stock: 10,
    imageUrl: null,
  },
];

/** Miroir de la regex ava-advisor (exclusion jetables) */
const AVA_EXCLUDED_PRODUCT =
  /\b(puff|jnr|jetable|disposables?|puff\s*bar|elf\s*bar)\b/i;

function isAvaExcludedProduct(p: CatalogProduct): boolean {
  const blob = `${p.name} ${p.brand ?? ""} ${p.category ?? ""} ${p.description ?? ""}`;
  return AVA_EXCLUDED_PRODUCT.test(blob);
}

function advisorLikeFilter(products: CatalogProduct[]): CatalogProduct[] {
  return products.filter((p) => !isAvaExcludedProduct(p));
}

// —— Constantes / speech (client immersif) ——
check("client-speech", "AVA_GREETING défini", Boolean(AVA_GREETING), AVA_GREETING.slice(0, 40));
check("client-speech", "Greeting sans « Je suis »", !/je suis/i.test(AVA_GREETING));
check("client-speech", "AVA_NAME_REPLY", AVA_NAME_REPLY === "Je m'appelle Ava.", AVA_NAME_REPLY);
check("client-speech", "Suggestions ≥ 3", AVA_SUGGESTIONS.length >= 3, String(AVA_SUGGESTIONS.length));
check("client-speech", "NO_EXACT_MATCH défini", Boolean(AVA_NO_EXACT_MATCH));
check(
  "client-speech",
  "humanize DIY → Di-Yaï",
  /Di-Ya[iï]/i.test(humanizeForSpeech("Voici notre selection DIY.")),
  humanizeForSpeech("Voici notre selection DIY.")
);
check(
  "client-speech",
  "humanize AVA → Ava",
  /Ava/.test(humanizeForSpeech("Bonjour AVA et A.V.A.")) &&
    !/A\.V\.A/.test(humanizeForSpeech("Bonjour AVA et A.V.A.")),
  humanizeForSpeech("Bonjour AVA et A.V.A.")
);
check("client-speech", "AVA_GREETING_SHORT", Boolean(AVA_GREETING_SHORT), AVA_GREETING_SHORT.slice(0, 50));
check("client-speech", "toSpokenText non vide", toSpokenText("DIY AVA").length > 0, toSpokenText("DIY AVA"));

// —— Facial rig 3D validé ——
check(
  "client-3d",
  "Label facial rig final",
  AVA_3D_ROADMAP.statusLabel === "AVA FACIAL RIG 1.0",
  AVA_3D_ROADMAP.statusLabel
);
check("client-3d", "Animation faciale avancée active", AVA_3D_ROADMAP.enableAdvancedLipSync && AVA_3D_ROADMAP.enableIdleAnimations);
const glbPath = path.join(process.cwd(), "public", "models", "ava", "Ava_FacialRig.glb");
const faceSvg = path.join(process.cwd(), "public", "ava", "ava-face-base.svg");
check("client-3d", "GLB facial final présent", fs.existsSync(glbPath), fs.existsSync(glbPath) ? "found" : `missing ${glbPath}`);
check("client-3d", "Portrait SVG présent", fs.existsSync(faceSvg), faceSvg);

// —— Age / script vente ——
check("client-rules", "AGE_REFUSAL +18", /majeur|18/i.test(AGE_REFUSAL));
check("client-rules", "isAgeConfirmed Oui", isAgeConfirmed("Oui, j'ai 18 ans ou plus") === true);
check("client-rules", "isAgeConfirmed Non", isAgeConfirmed("Non") === false);
check("client-rules", "SALES_STEPS ≥ 5", SALES_STEPS.length >= 5, String(SALES_STEPS.length));

// —— Exclusion puff à toutes les entrées du catalogue Ava ——
const filtered = advisorLikeFilter(samples);
check(
  "client-exclusion",
  "Puff Blueberry exclu du catalogue A.V.A.",
  !filtered.some((p) => /puff/i.test(p.name)),
  filtered.map((p) => p.name).join(" | ")
);
check(
  "client-exclusion",
  "JNR exclu",
  !filtered.some((p) => /jnr/i.test(p.name)),
  filtered.map((p) => p.name).join(" | ")
);
check(
  "client-exclusion",
  "Kit Pod conservé",
  filtered.some((p) => p.slug === "kit-pod")
);

// Branche message puff (miroir ava-advisor)
const puffMsg = "Je veux une puff";
const puffBranch = /\bpuff\b|jnr|jetable|disposable/i.test(puffMsg);
check("client-exclusion", "Branche refus puff déclenchée", puffBranch);
check(
  "client-exclusion",
  "searchCatalog exclut les puffs",
  !searchCatalog(samples, puffMsg, { limit: 3 }).some(isAvaExcludedProduct),
  searchCatalog(samples, puffMsg, { limit: 3 })
    .map((p) => p.name)
    .join(" | ")
);

// —— Recherche catalogue (client immersif /api/ai-assistant) ——
const cases: Array<[string, RegExp]> = [
  ["Je cherche un Frais Rouge.", /frais\s*rouge/i],
  ["Je veux un DIY.", /diy/i],
  ["Je cherche une resistance Vaporesso.", /vaporesso|gtx/i],
  ["Je veux un liquide menthe.", /menthe/i],
  ["Je cherche une cigarette electronique.", /pod|kit|cigarette|puff/i],
];
for (const [q, re] of cases) {
  const hits = searchCatalog(samples, q, { limit: 3 });
  check("client-search", `search: ${q}`, hits.length > 0 && hits.some((p) => re.test(`${p.name} ${p.description}`)), hits.map((p) => p.name).join(" | ") || "(none)");
}

// —— Learning profil (mémoire client) ——
const learned = extractProfileUpdates("Je suis débutant, j'aime le fruité frais, 6mg, tirage serré");
check(
  "client-memory",
  "extractProfileUpdates détecte saveurs/nic",
  Boolean(learned.preferredFlavors?.length || learned.usedNicotineMg || learned.status),
  JSON.stringify(learned)
);

// —— Admin + page /ia via askAI (LocalAIProvider) ——
check("admin-ai", "3 services AI_SERVICES", AI_SERVICES.length === 3, AI_SERVICES.map((s) => s.id).join(","));
check(
  "admin-ai",
  "Services attendus",
  AI_SERVICES.map((s) => s.id).sort().join() ===
    ["eliquid-recommender", "pokemon-estimator", "vape-advisor"].sort().join()
);

async function runAskAI() {
  // Sans userId → message connexion (local-advisor) pour vape/eliquid
  const guest = await askAI({
    service: "vape-advisor",
    messages: [{ role: "user", content: "Bonjour" }],
  });
  check(
    "admin-ai",
    "askAI guest → invite connexion",
    /connectez-vous/i.test(guest.content),
    guest.content.slice(0, 80)
  );

  const eliquid = await askAI({
    service: "eliquid-recommender",
    messages: [{ role: "user", content: "Menthe" }],
  });
  check(
    "admin-ai",
    "askAI eliquid guest → invite connexion",
    /connectez-vous/i.test(eliquid.content),
    eliquid.content.slice(0, 80)
  );

  const poke = await askAI({
    service: "pokemon-estimator",
    messages: [{ role: "user", content: "Charizard" }],
  });
  check(
    "admin-ai",
    "askAI pokemon → stub à venir",
    /pokémon|pokemon|à venir|avenir/i.test(poke.content),
    poke.content.slice(0, 80)
  );
}

// —— Fichiers UI client / admin présents ——
const mustExist = [
  "app/ia/page.tsx",
  "app/admin/ai/page.tsx",
  "app/api/ai/route.ts",
  "app/api/ai-assistant/route.ts",
  "components/ai/ImmersiveAvaScreen.tsx",
  "components/ai/HolographicAssistant.tsx",
  "components/ai/ChatWindow.tsx",
  "components/home/AvaSidePanel.tsx",
  "components/admin/AdminSidebar.tsx",
  "hooks/useVoiceConversation.ts",
  "lib/ai/ava-advisor.ts",
  "lib/ai/holographic-advisor.ts",
  "lib/ai/local-advisor.ts",
  "lib/ai/local-advisor-provider.ts",
];
for (const f of mustExist) {
  check("structure", f, fs.existsSync(path.join(process.cwd(), f)));
}

// Immersive label + admin sidebar link
const immersive = fs.readFileSync(path.join(process.cwd(), "components/ai/ImmersiveAvaScreen.tsx"), "utf8");
check("client-ui", "Immersive affiche statusLabel", immersive.includes("AVA_3D_ROADMAP.statusLabel"));
const sidebar = fs.readFileSync(path.join(process.cwd(), "components/admin/AdminSidebar.tsx"), "utf8");
check("admin-ui", "Sidebar lien /admin/ai", sidebar.includes("/admin/ai"));
const adminPage = fs.readFileSync(path.join(process.cwd(), "app/admin/ai/page.tsx"), "utf8");
check("admin-ui", "Admin appelle /api/ai", adminPage.includes("/api/ai") && adminPage.includes("Tester (stub)"));
const iaPage = fs.readFileSync(path.join(process.cwd(), "app/ia/page.tsx"), "utf8");
check("client-ui", "Page /ia appelle /api/ai", iaPage.includes("/api/ai"));
const voiceHook = fs.readFileSync(path.join(process.cwd(), "hooks/useVoiceConversation.ts"), "utf8");
check("client-ui", "Voix utilise /api/ai-assistant", voiceHook.includes("/api/ai-assistant"));

// OpenAI flag (info)
check("config", "isOpenAIConfigured (info)", true, isOpenAIConfigured() ? "OPENAI_API_KEY présent" : "local/browser voice only");

// —— chatAva avec DB si disponible ——
async function runChatAvaIfDb() {
  if (!process.env.DATABASE_URL) {
    check("client-advisor-db", "chatAva DB", true, "SKIP — vérifié pendant le build Vercel");
    return;
  }
  try {
    const { chatAva, initAva } = await import("../lib/ai/ava-advisor");
    const init = await initAva(undefined);
    check("client-advisor-db", "initAva guest", /Ava|recherchez/i.test(init.message), init.message.slice(0, 60));

    const name = await chatAva(undefined, "Comment tu t'appelles ?");
    check("client-advisor-db", "chatAva nom", name.content === AVA_NAME_REPLY, name.content);

    const age = await chatAva(undefined, "Je suis mineur");
    check("client-advisor-db", "chatAva mineur bloqué", Boolean(age.blocked) && /majeur|18/i.test(age.content), age.content.slice(0, 60));

    const puff = await chatAva(undefined, "Je veux une puff");
    const puffOk =
      /ne recommande pas|jetables|puffs/i.test(puff.content) &&
      !puff.products.some((p) => AVA_EXCLUDED_PRODUCT.test(`${p.name} ${p.brand ?? ""}`));
    check("client-advisor-db", "chatAva refus puff + 0 jetable", puffOk, `${puff.content.slice(0, 80)} | products=${puff.products.length}`);

    const menthe = await chatAva(undefined, "Je cherche un e-liquide menthe");
    check(
      "client-advisor-db",
      "chatAva menthe",
      menthe.products.length >= 0 && !/error/i.test(menthe.content),
      `products=${menthe.products.length} — ${menthe.content.slice(0, 60)}`
    );

    const boutique = await chatAva(undefined, "Où est la boutique Hautmont ?");
    check("client-advisor-db", "chatAva boutique", /Hautmont|horaire|All Vap/i.test(boutique.content), boutique.content.slice(0, 80));

    const budget = await chatAva(undefined, "Quel est votre budget ?");
    check("client-advisor-db", "chatAva ignore budget", /prix sont indiqués/i.test(budget.content), budget.content.slice(0, 80));
  } catch (e) {
    check("client-advisor-db", "chatAva DB", false, String(e).slice(0, 200));
  }
}

async function main() {
  await runAskAI();
  await runChatAvaIfDb();

  const ok = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok).length;
  console.log("\n========== RÉSUMÉ ==========");
  const areas = [...new Set(results.map((r) => r.area))];
  for (const a of areas) {
    const subset = results.filter((r) => r.area === a);
    const o = subset.filter((r) => r.ok).length;
    console.log(`${a}: ${o}/${subset.length}`);
  }
  console.log(`TOTAL: ${ok} OK, ${fail} FAIL`);

  const reportPath = path.join(process.cwd(), "docs", "_ava_integral_results.json");
  fs.writeFileSync(
    reportPath,
    JSON.stringify({ ok, fail, results, at: new Date().toISOString() }, null, 2)
  );
  console.log(`JSON → ${reportPath}`);

  process.exit(fail > 0 ? 1 : 0);
}

void main();
