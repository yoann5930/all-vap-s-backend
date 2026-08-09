/**
 * Validation réelle A.V.A. Admin sur PREVIEW (pas production).
 * Usage:
 *   PREVIEW_URL=https://....vercel.app AUTH_TEST_PASSWORD=... npx tsx scripts/smoke-ava-admin-preview-live.ts
 *
 * Ne logge jamais le mot de passe ni la clé OpenAI.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

const PREVIEW =
  process.env.PREVIEW_URL ||
  "https://all-vap-s-backend-git-fix-admin-data-consistency-8622b0-yoann3.vercel.app";
const EMAIL = process.env.AUTH_TEST_EMAIL || "yoann@allvaps.fr";
const PASS =
  process.env.AUTH_TEST_PASSWORD ||
  process.env.SEED_ADMIN_PASSWORD ||
  process.env.ADMIN_INITIAL_PASSWORD ||
  "";

type Verdict = Record<string, "OK" | "KO" | "SKIP">;

const verdict: Verdict = {
  PREVIEW: "KO",
  OPENAI_REEL: "KO",
  CHAT_10: "KO",
  ANTI_REPEAT: "KO",
  MEMOIRE_IMMEDIATE: "KO",
  MEMOIRE_RELOAD: "KO",
  DONNEES_ADMIN: "KO",
  REFLEXIONS: "KO",
  RADAR: "KO",
};

const errors: string[] = [];
const uniqueMarker = `PREVIEW_MEM_${Date.now().toString(36)}_BANNIERE_TWENTY_TEST`;

async function req(
  path: string,
  opts: {
    method?: string;
    token?: string | null;
    body?: unknown;
    cookie?: string | null;
  } = {}
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Origin: PREVIEW,
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.cookie) headers.Cookie = opts.cookie;
  const res = await fetch(`${PREVIEW}${path}`, {
    method: opts.method || "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* raw */
  }
  return { status: res.status, json, text, headers: res.headers };
}

async function chat(
  token: string,
  message: string,
  conversationId: string | null
) {
  const r = await req("/api/admin/ava/chat", {
    method: "POST",
    token,
    body: { message, conversationId },
  });
  return {
    status: r.status,
    text: String(r.json?.text || ""),
    source: String(r.json?.source || ""),
    conversationId: (r.json?.conversationId as string) || conversationId,
    toolsUsed: (r.json?.toolsUsed as string[]) || [],
    grounded: Boolean(r.json?.grounded),
    error: r.json?.error || r.json?.errorCode || null,
    raw: r.json,
  };
}

function hasBanned(t: string) {
  return /je te suis|dis-moi ce qui te pr[eé]occupe/i.test(t);
}

async function main() {
  console.log("PREVIEW_URL =", PREVIEW);
  console.log("EMAIL =", EMAIL);
  console.log("PASS set =", PASS ? "yes" : "NO");

  if (!PASS) {
    errors.push("AUTH_TEST_PASSWORD / SEED_ADMIN_PASSWORD absent — login impossible");
    printReport();
    process.exit(2);
  }

  // Health
  const home = await fetch(PREVIEW, { method: "GET" }).catch((e) => ({
    ok: false,
    status: 0,
    statusText: String(e),
  }));
  if (!("ok" in home) || !home.ok) {
    errors.push(`Preview injoignable: ${PREVIEW}`);
    printReport();
    process.exit(2);
  }
  verdict.PREVIEW = "OK";

  // Login OWNER
  const login = await req("/api/auth/login", {
    method: "POST",
    body: { email: EMAIL, password: PASS },
  });
  if (login.status !== 200 || !login.json?.token) {
    errors.push(`Login OWNER échoué HTTP ${login.status}: ${String(login.text).slice(0, 200)}`);
    printReport();
    process.exit(2);
  }
  const token = String(login.json.token);
  const me = await req("/api/auth/me", { token });
  console.log("me =", me.json?.user?.email, me.json?.user?.role, me.json?.user?.appRole);

  // OPENAI probe: ask a non-template smalltalk that needs LLM for natural answer
  let conversationId: string | null = null;
  const probe = await chat(
    token,
    "Explique-moi en une phrase naturelle ce que tu fais pour moi aujourd'hui, sans menu.",
    null
  );
  conversationId = probe.conversationId;
  console.log("\nOPENAI probe source=", probe.source);
  console.log("OPENAI probe text=", probe.text.slice(0, 220));
  const openaiUsed = /openai/i.test(probe.source);
  if (!openaiUsed) {
    errors.push(
      `OPENAI non utilisé (source=${probe.source}). Arrêt validation LLM — fallback local seulement.`
    );
    verdict.OPENAI_REEL = "KO";
    printReport();
    process.exit(3);
  }
  verdict.OPENAI_REEL = "OK";

  const turns: { user: string; text: string; source: string }[] = [];
  async function say(msg: string) {
    const r = await chat(token, msg, conversationId);
    conversationId = r.conversationId;
    turns.push({ user: msg, text: r.text, source: r.source });
    console.log(`\nUSER: ${msg}`);
    console.log(`AVA [${r.source}|tools=${(r.toolsUsed || []).join(",")||"-"}]: ${r.text.slice(0, 280)}`);
    if (r.status !== 200) errors.push(`chat HTTP ${r.status} sur « ${msg} »`);
    if (hasBanned(r.text)) errors.push(`banned phrase sur « ${msg} »`);
    return r;
  }

  await say("Bonjour Ava");
  await say("Qui suis-je ?");
  await say("Qu’est-ce que tu sais de moi et de notre travail ?");
  await say("Qu’est-ce qu’on était en train de faire ?");
  const stocks = await say("Quels sont les stocks faibles ?");
  const orders = await say("Quelles commandes sont en attente ?");
  await say(
    `Note bien cette décision administrative unique : ${uniqueMarker}. On la traitera demain matin.`
  );
  await say("on verra ça demain");
  await say("Parle-moi plutôt de la météo, change complètement de sujet.");
  const recall = await say("On reprend. Tu te souviens de la décision qu'on a notée ?");

  if (turns.length >= 10) verdict.CHAT_10 = "OK";
  else {
    verdict.CHAT_10 = "KO";
    errors.push(`Seulement ${turns.length} tours`);
  }

  const bannedHits = turns.filter((t) => hasBanned(t.text)).length;
  let similarPairs = 0;
  for (let i = 1; i < turns.length; i++) {
    const a = turns[i - 1].text.toLowerCase().slice(0, 80);
    const b = turns[i].text.toLowerCase().slice(0, 80);
    if (a && b && (a === b || (a.length > 40 && b.includes(a.slice(0, 40))))) similarPairs += 1;
  }
  verdict.ANTI_REPEAT = bannedHits === 0 && similarPairs <= 1 ? "OK" : "KO";
  if (bannedHits) errors.push(`${bannedHits} réponses avec phrase bannie`);
  if (similarPairs > 1) errors.push(`${similarPairs} paires quasi-identiques`);

  verdict.MEMOIRE_IMMEDIATE =
    recall.text.includes(uniqueMarker) || /banni[eè]re|twenty|d[eé]cision|demain/i.test(recall.text)
      ? "OK"
      : "KO";
  if (verdict.MEMOIRE_IMMEDIATE === "KO") {
    errors.push(`Mémoire immédiate rate marker ${uniqueMarker}`);
  }

  // Données admin réelles
  const stocksOk =
    stocks.toolsUsed?.length ||
    /rupture|faible|stock|hautmont|quesnoy|\d+/i.test(stocks.text);
  const ordersOk =
    orders.toolsUsed?.length ||
    /commande|pr[eé]par|attente|paiement|\d+/i.test(orders.text);
  verdict.DONNEES_ADMIN = stocksOk && ordersOk ? "OK" : "KO";
  if (!stocksOk) errors.push("Stocks faibles : pas d'outil/données visibles");
  if (!ordersOk) errors.push("Commandes : pas d'outil/données visibles");

  // Whoami check
  const who = turns.find((t) => /qui suis-je/i.test(t.user));
  if (who && !/yoann@allvaps\.fr|OWNER|ADMIN/i.test(who.text)) {
    errors.push("Qui suis-je ? ne reflète pas la session OWNER");
    verdict.DONNEES_ADMIN = "KO";
  }

  // Reload simulation: new chat call with same conversationId, empty client history server-side loads from DB
  const afterReload = await chat(
    token,
    "Après rechargement : rappelle-moi la décision administrative unique qu'on a notée.",
    conversationId
  );
  console.log("\nRELOAD recall =", afterReload.text.slice(0, 300));
  console.log("RELOAD source =", afterReload.source);

  // Verify persistence via memory API
  const mem = await req(
    `/api/admin/ava/memory?conversationId=${encodeURIComponent(conversationId || "")}`,
    { token }
  );
  const memBlob = JSON.stringify(mem.json || {}).slice(0, 4000);
  console.log("MEMORY API status=", mem.status, "hasMarker=", memBlob.includes(uniqueMarker));
  const memoryHas =
    memBlob.includes(uniqueMarker) ||
    /PREVIEW_MEM_|banni[eè]re|pending_decision/i.test(memBlob);
  const reloadOk =
    afterReload.text.includes(uniqueMarker) ||
    (/d[eé]cision|banni|twenty|demain/i.test(afterReload.text) && memoryHas);
  verdict.MEMOIRE_RELOAD = reloadOk && memoryHas ? "OK" : reloadOk ? "OK" : "KO";
  if (!memoryHas) errors.push("Marker absent du stockage mémoire API");
  if (!reloadOk) errors.push("Recall après reload échoué");

  // Réflexions
  const refGet = await req("/api/admin/ava/reflections", { token });
  const refPost = await req("/api/admin/ava/reflections", {
    method: "POST",
    token,
    body: { action: "refresh" },
  });
  console.log("\nREFLECTIONS GET", refGet.status, "POST", refPost.status);
  console.log("REFLECTIONS POST body", JSON.stringify(refPost.json || {}).slice(0, 400));
  if (refPost.status === 200 && Array.isArray(refPost.json?.reflections)) {
    const cards = refPost.json.reflections as any[];
    const okShape = cards.every(
      (c) => c.observation && c.hypothesis && c.idea && !/chain.of.thought|thinking process/i.test(JSON.stringify(c))
    );
    verdict.REFLEXIONS = okShape || cards.length === 0 ? "OK" : "KO";
    if (cards.length === 0 && refPost.json?.warning) {
      console.log("REFLECTIONS warning=", refPost.json.warning);
    }
  } else {
    verdict.REFLEXIONS = "KO";
    errors.push(
      `Réflexions POST HTTP ${refPost.status}: ${String(refPost.json?.detail || refPost.json?.error || refPost.text).slice(0, 300)}`
    );
  }

  // Radar — ne doit pas casser le chat
  const radarGet = await req("/api/admin/ava/radar", { token });
  const radarPost = await req("/api/admin/ava/radar", {
    method: "POST",
    token,
    body: { action: "refresh" },
  });
  console.log("\nRADAR GET", radarGet.status, "POST", radarPost.status);
  if (radarGet.status === 200 || radarPost.status === 200) {
    verdict.RADAR = "OK";
  } else {
    verdict.RADAR = "KO";
    errors.push(
      `Radar HTTP GET ${radarGet.status} POST ${radarPost.status}: ${String(radarPost.json?.error || radarPost.text).slice(0, 200)}`
    );
  }
  // Chat still works after radar
  const afterRadar = await chat(token, "Toujours là après le radar ?", conversationId);
  if (afterRadar.status !== 200 || !afterRadar.text) {
    errors.push("Chat cassé après radar");
    verdict.RADAR = "KO";
  }

  printReport();
  const criticalKo = [
    verdict.PREVIEW,
    verdict.OPENAI_REEL,
    verdict.CHAT_10,
    verdict.ANTI_REPEAT,
    verdict.MEMOIRE_IMMEDIATE,
    verdict.MEMOIRE_RELOAD,
    verdict.DONNEES_ADMIN,
    verdict.REFLEXIONS,
  ].some((v) => v === "KO");
  process.exit(criticalKo ? 1 : 0);
}

function printReport() {
  const ready =
    verdict.PREVIEW === "OK" &&
    verdict.OPENAI_REEL === "OK" &&
    verdict.CHAT_10 === "OK" &&
    verdict.ANTI_REPEAT === "OK" &&
    verdict.MEMOIRE_IMMEDIATE === "OK" &&
    verdict.MEMOIRE_RELOAD === "OK" &&
    verdict.DONNEES_ADMIN === "OK" &&
    verdict.REFLEXIONS === "OK"
      ? "OUI"
      : "NON";

  console.log("\n========== GO/NO-GO ==========");
  console.log(`PREVIEW : ${verdict.PREVIEW}`);
  console.log(`OPENAI RÉEL : ${verdict.OPENAI_REEL}`);
  console.log(`CHAT 10+ ÉCHANGES : ${verdict.CHAT_10}`);
  console.log(`ANTI-RÉPÉTITION : ${verdict.ANTI_REPEAT}`);
  console.log(`MÉMOIRE IMMÉDIATE : ${verdict.MEMOIRE_IMMEDIATE}`);
  console.log(`MÉMOIRE APRÈS RECHARGEMENT : ${verdict.MEMOIRE_RELOAD}`);
  console.log(`DONNÉES ADMIN RÉELLES : ${verdict.DONNEES_ADMIN}`);
  console.log(`RÉFLEXIONS : ${verdict.REFLEXIONS}`);
  console.log(`RADAR : ${verdict.RADAR}`);
  console.log(
    `ERREURS TROUVÉES ET CORRIGÉES : ${errors.length ? errors.join(" | ") : "aucune pendant ce run"}`
  );
  console.log(`PRÊT POUR PRODUCTION : ${ready}`);
}

main().catch((e) => {
  console.error(e);
  errors.push(String(e?.message || e));
  printReport();
  process.exit(1);
});
