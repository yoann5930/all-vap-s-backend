/**
 * Validation Preview A.V.A. Admin via fetch + protection bypass (pas le mdp prod).
 *
 * Env:
 *   PREVIEW_DEPLOY=https://....vercel.app
 *   AUTH_PREVIEW_TEST_PASSWORD=... (Preview only)
 *   VERCEL_AUTOMATION_BYPASS_SECRET=... (ou lu via --bypass=)
 */
import { config } from "dotenv";
import { readFileSync, existsSync, unlinkSync, writeFileSync } from "fs";

config({ path: ".env.local" });
config();

const DEPLOY =
  process.env.PREVIEW_DEPLOY ||
  "https://all-vap-s-backend-git-fix-admin-data-consistency-8622b0-yoann3.vercel.app";
const EMAIL = process.env.AUTH_TEST_EMAIL || "yoann@allvaps.fr";
const passArg = process.argv.find((a) => a.startsWith("--pass="))?.slice(7);
const bypassArg = process.argv.find((a) => a.startsWith("--bypass="))?.slice(9);
const PASS =
  passArg ||
  process.env.AUTH_PREVIEW_TEST_PASSWORD ||
  (existsSync(".tmp-preview-auth-secret.txt")
    ? readFileSync(".tmp-preview-auth-secret.txt", "utf8").trim()
    : "");
const BYPASS =
  bypassArg ||
  process.env.VERCEL_AUTOMATION_BYPASS_SECRET ||
  process.env.VERCEL_PROTECTION_BYPASS ||
  "";

const uniqueMarker = `PREVIEW_MEM_${Date.now().toString(36)}_BANNIERE_TWENTY_TEST`;
const errors: string[] = [];
const verdict: Record<string, "OK" | "KO"> = {
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

async function api(
  path: string,
  opts: { method?: string; body?: unknown; token?: string | null } = {}
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Origin: DEPLOY,
  };
  if (BYPASS) {
    headers["x-vercel-protection-bypass"] = BYPASS;
  }
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(`${DEPLOY}${path}`, {
    method: opts.method || "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  }).catch((e: any) => {
    throw new Error(
      `fetch failed ${opts.method || "GET"} ${path}: ${e?.message || e}${
        e?.cause ? ` cause=${e.cause?.message || e.cause}` : ""
      }`
    );
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

function hasBanned(t: string) {
  return /je te suis|dis-moi ce qui te pr[eé]occupe/i.test(t);
}

async function main() {
  console.log("DEPLOY", DEPLOY);
  console.log("EMAIL", EMAIL);
  console.log("PASS set", PASS ? "yes" : "NO");
  console.log("BYPASS set", BYPASS ? "yes" : "NO");
  if (!PASS) {
    errors.push("AUTH_PREVIEW_TEST_PASSWORD manquant");
    print();
    process.exit(2);
  }
  if (!BYPASS) {
    errors.push("VERCEL_AUTOMATION_BYPASS_SECRET manquant");
    print();
    process.exit(2);
  }

  const health = await api("/api/auth/me");
  if (health.status === 401 || health.status === 200) verdict.PREVIEW = "OK";
  else {
    errors.push(`Preview health HTTP ${health.status}: ${health.text.slice(0, 120)}`);
    print();
    process.exit(2);
  }

  const login = await api("/api/auth/login", {
    method: "POST",
    body: { email: EMAIL, password: PASS },
  });
  console.log(
    "login status",
    login.status,
    "authVia=",
    login.json?.authVia || "password?",
    "email=",
    login.json?.user?.email
  );
  const token = login.json?.token as string | undefined;
  if (login.status !== 200 || !token) {
    errors.push(`Login HTTP ${login.status}: ${String(login.text).slice(0, 220)}`);
    print();
    process.exit(2);
  }
  if (login.json?.authVia !== "preview_test") {
    errors.push("Login n'a pas utilisé authVia=preview_test (vérifier VERCEL_ENV/secret)");
  }

  const me = await api("/api/auth/me", { token });
  console.log("me", me.status, me.json?.user?.email, me.json?.user?.role);

  let conversationId: string | null = null;
  const turns: { user: string; text: string; source: string }[] = [];

  async function chat(message: string) {
    const r = await api("/api/admin/ava/chat", {
      method: "POST",
      token,
      body: { message, conversationId },
    });
    conversationId = r.json?.conversationId || conversationId;
    const text = String(r.json?.text || "");
    const source = String(r.json?.source || "");
    turns.push({ user: message, text, source });
    console.log(`\nUSER: ${message}`);
    console.log(
      `AVA [${r.status}|${source}|tools=${(r.json?.toolsUsed || []).join(",") || "-"}]: ${text.slice(0, 280)}`
    );
    if (r.status !== 200) errors.push(`chat HTTP ${r.status} « ${message} »`);
    if (hasBanned(text)) errors.push(`banned « ${message} »`);
    return r;
  }

  const probe = await chat(
    "Sans menu ni outils : en 2 phrases naturelles, dis-moi comment tu travailles avec moi au quotidien en tant que collaboratrice Admin."
  );
  if (!/openai/i.test(String(probe.json?.source || ""))) {
    verdict.OPENAI_REEL = "KO";
    errors.push(`OPENAI non utilisé (source=${probe.json?.source}). STOP.`);
    print();
    process.exit(3);
  }
  verdict.OPENAI_REEL = "OK";

  await chat("Bonjour Ava");
  await chat("Qui suis-je ?");
  await chat("Qu’est-ce que tu sais de moi et de notre travail ?");
  await chat("Qu’est-ce qu’on était en train de faire ?");
  const stocks = await chat("Quels sont les stocks faibles ?");
  const orders = await chat("Quelles commandes sont en attente ?");
  await chat(
    `Note bien cette décision administrative unique : ${uniqueMarker}. On la traitera demain matin.`
  );
  await chat("on verra ça demain");
  await chat("Parle-moi plutôt de la météo, change complètement de sujet.");
  const recall = await chat("On reprend. Tu te souviens de la décision qu'on a notée ?");

  verdict.CHAT_10 = turns.length >= 10 ? "OK" : "KO";
  const bannedHits = turns.filter((t) => hasBanned(t.text)).length;
  let similar = 0;
  for (let i = 1; i < turns.length; i++) {
    const a = turns[i - 1].text.toLowerCase().slice(0, 70);
    const b = turns[i].text.toLowerCase().slice(0, 70);
    if (a && b && (a === b || (a.length > 35 && b.includes(a.slice(0, 35))))) similar += 1;
  }
  verdict.ANTI_REPEAT = bannedHits === 0 && similar <= 1 ? "OK" : "KO";
  verdict.MEMOIRE_IMMEDIATE =
    String(recall.json?.text || "").includes(uniqueMarker) ||
    /banni|twenty|d[eé]cision|demain|PREVIEW_MEM/i.test(String(recall.json?.text || ""))
      ? "OK"
      : "KO";

  const stocksOk =
    (stocks.json?.toolsUsed || []).length ||
    /rupture|faible|stock|\d+/i.test(String(stocks.json?.text || ""));
  const ordersOk =
    (orders.json?.toolsUsed || []).length ||
    /commande|attente|pr[eé]par|paiement|\d+/i.test(String(orders.json?.text || ""));
  const who = turns.find((t) => /qui suis-je/i.test(t.user));
  const whoOk = who && /yoann@allvaps\.fr|OWNER|ADMIN/i.test(who.text);
  verdict.DONNEES_ADMIN = stocksOk && ordersOk && whoOk ? "OK" : "KO";
  if (!whoOk) errors.push("Qui suis-je ? ne reflète pas la session");

  const afterReload = await chat(
    "Après rechargement : rappelle-moi la décision administrative unique qu'on a notée."
  );
  const mem = await api(
    `/api/admin/ava/memory?conversationId=${encodeURIComponent(conversationId || "")}`,
    { token }
  );
  const memBlob = JSON.stringify(mem.json || {});
  console.log("MEMORY hasMarker", memBlob.includes(uniqueMarker), "HTTP", mem.status);
  const memoryHas =
    memBlob.includes(uniqueMarker) || /PREVIEW_MEM_|pending_decision/i.test(memBlob);
  const reloadOk =
    String(afterReload.json?.text || "").includes(uniqueMarker) ||
    (/d[eé]cision|banni|twenty|demain|PREVIEW_MEM/i.test(
      String(afterReload.json?.text || "")
    ) &&
      memoryHas);
  verdict.MEMOIRE_RELOAD = reloadOk ? "OK" : "KO";
  if (!memoryHas) errors.push("Marker absent mémoire API");

  const refPost = await api("/api/admin/ava/reflections", {
    method: "POST",
    token,
    body: { action: "refresh" },
  });
  console.log("REFLECTIONS", refPost.status, String(refPost.text).slice(0, 250));
  verdict.REFLEXIONS =
    refPost.status === 200 && Array.isArray(refPost.json?.reflections) ? "OK" : "KO";
  if (verdict.REFLEXIONS === "KO") {
    errors.push(
      `Réflexions HTTP ${refPost.status}: ${String(refPost.json?.detail || refPost.json?.error || refPost.text).slice(0, 250)}`
    );
  }

  const radarGet = await api("/api/admin/ava/radar", { token });
  const radarPost = await api("/api/admin/ava/radar", {
    method: "POST",
    token,
    body: { action: "refresh" },
  });
  console.log("RADAR", radarGet.status, radarPost.status);
  verdict.RADAR = radarGet.status === 200 || radarPost.status === 200 ? "OK" : "KO";
  const afterRadar = await chat("Toujours là après le radar ?");
  if (afterRadar.status !== 200) {
    verdict.RADAR = "KO";
    errors.push("Chat cassé après radar");
  }

  // Ne jamais écrire le secret dans un artefact
  if (existsSync(".tmp-preview-auth-secret.txt")) {
    try {
      unlinkSync(".tmp-preview-auth-secret.txt");
    } catch {
      /* ignore */
    }
  }
  print();
  const critical = [
    verdict.PREVIEW,
    verdict.OPENAI_REEL,
    verdict.CHAT_10,
    verdict.ANTI_REPEAT,
    verdict.MEMOIRE_IMMEDIATE,
    verdict.MEMOIRE_RELOAD,
    verdict.DONNEES_ADMIN,
    verdict.REFLEXIONS,
  ].some((v) => v === "KO");
  process.exit(critical ? 1 : 0);
}

function print() {
  const ready = [
    verdict.PREVIEW,
    verdict.OPENAI_REEL,
    verdict.CHAT_10,
    verdict.ANTI_REPEAT,
    verdict.MEMOIRE_IMMEDIATE,
    verdict.MEMOIRE_RELOAD,
    verdict.DONNEES_ADMIN,
    verdict.REFLEXIONS,
  ].every((v) => v === "OK")
    ? "OUI"
    : "NON";
  console.log("\n========== GO/NO-GO ==========");
  console.log(`AUTH PREVIEW : ${verdict.PREVIEW === "OK" && !errors.some((e) => /Login HTTP/i.test(e)) ? "OK" : "KO"}`);
  console.log(`PRODUCTION TOUCHÉE : NON`);
  console.log(`OPENAI RÉEL : ${verdict.OPENAI_REEL}`);
  console.log(`CHAT 10+ : ${verdict.CHAT_10}`);
  console.log(`MÉMOIRE : ${verdict.MEMOIRE_IMMEDIATE === "OK" && verdict.MEMOIRE_RELOAD === "OK" ? "OK" : "KO"}`);
  console.log(`RÉFLEXIONS : ${verdict.REFLEXIONS}`);
  console.log(`RADAR : ${verdict.RADAR}`);
  console.log(
    `ERREURS : ${errors.length ? errors.join(" | ") : "aucune"}`
  );
  console.log(`PRÊT PROD : ${ready}`);
  // Compat format précédent
  console.log(`PREVIEW : ${verdict.PREVIEW}`);
  console.log(`ANTI-RÉPÉTITION : ${verdict.ANTI_REPEAT}`);
  console.log(`DONNÉES ADMIN RÉELLES : ${verdict.DONNEES_ADMIN}`);
}

main().catch((e) => {
  errors.push(String(e?.message || e));
  print();
  process.exit(1);
});
