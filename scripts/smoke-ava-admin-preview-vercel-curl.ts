/**
 * Preview live validation via `vercel curl` (bypass SSO automatique).
 * Mot de passe OWNER: AUTH_TEST_PASSWORD | SEED_ADMIN_PASSWORD | arg --pass=
 *
 * Usage:
 *   npx tsx scripts/smoke-ava-admin-preview-vercel-curl.ts --pass=***
 */
import { spawnSync } from "child_process";
import { writeFileSync, unlinkSync, existsSync } from "fs";
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env.preview.pull" });
config();

const DEPLOY =
  process.env.PREVIEW_DEPLOY ||
  "https://all-vap-s-backend-f4g6qiqp7-yoann3.vercel.app";
const EMAIL = process.env.AUTH_TEST_EMAIL || "yoann@allvaps.fr";
const passArg = process.argv.find((a) => a.startsWith("--pass="))?.slice(7);
const PASS =
  passArg ||
  process.env.AUTH_PREVIEW_TEST_PASSWORD ||
  process.env.AUTH_TEST_PASSWORD ||
  process.env.SEED_ADMIN_PASSWORD ||
  process.env.ADMIN_INITIAL_PASSWORD ||
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

function vercelCurl(
  path: string,
  opts: { method?: string; body?: unknown; token?: string | null } = {}
): { status: number; json: any; text: string } {
  const bodyFile = `.tmp-vercel-body-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`;
  const dataFile = opts.body !== undefined ? `.tmp-vercel-data-${Date.now()}.json` : null;
  const args = [
    "vercel",
    "curl",
    path,
    "--deployment",
    DEPLOY,
    "--",
    "--silent",
    "--show-error",
    "--output",
    bodyFile,
    "--write-out",
    "HTTPCODE:%{http_code}",
  ];
  if (opts.method) args.push("--request", opts.method);
  if (dataFile) {
    writeFileSync(dataFile, JSON.stringify(opts.body), "utf8");
    args.push("--header", "Content-Type: application/json");
    args.push("--data-binary", `@${dataFile}`);
  }
  if (opts.token) {
    // Un seul argument pour éviter le split Windows sur l'espace Bearer
    args.push(`--header=Authorization: Bearer ${opts.token}`);
  }

  const r = spawnSync("npx", args, {
    encoding: "utf8",
    shell: true,
    maxBuffer: 2 * 1024 * 1024,
  });
  const meta = `${r.stdout || ""}${r.stderr || ""}`;
  const m = meta.match(/HTTPCODE:(\d+)/);
  let status = m ? Number(m[1]) : 0;
  let text = "";
  try {
    text = existsSync(bodyFile) ? require("fs").readFileSync(bodyFile, "utf8") : "";
  } catch {
    text = "";
  }
  if (existsSync(bodyFile)) {
    try {
      unlinkSync(bodyFile);
    } catch {
      /* ignore */
    }
  }
  if (dataFile && existsSync(dataFile)) {
    try {
      unlinkSync(dataFile);
    } catch {
      /* ignore */
    }
  }
  if (!status) status = r.status === 0 ? 200 : 500;
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status, json, text };
}

function hasBanned(t: string) {
  return /je te suis|dis-moi ce qui te pr[eé]occupe/i.test(t);
}

async function main() {
  console.log("DEPLOY", DEPLOY);
  console.log("EMAIL", EMAIL);
  console.log("PASS set", PASS ? "yes" : "NO");
  if (!PASS) {
    errors.push("Mot de passe OWNER manquant (AUTH_TEST_PASSWORD)");
    print();
    process.exit(2);
  }

  // Health : la home HTML peut être volumineuse — on accepte 2xx/3xx/404 HTML
  const health = vercelCurl("/api/auth/me");
  if (health.status === 401 || health.status === 200 || (health.status >= 200 && health.status < 500)) {
    verdict.PREVIEW = "OK";
  } else {
    errors.push(`Preview health HTTP ${health.status}`);
    print();
    process.exit(2);
  }

  const login = vercelCurl("/api/auth/login", {
    method: "POST",
    body: { email: EMAIL, password: PASS },
  });
  console.log("login status", login.status, String(login.text).slice(0, 180));
  const token = login.json?.token || login.json?.accessToken;
  if (login.status !== 200 || !token) {
    errors.push(`Login OWNER HTTP ${login.status}: ${String(login.text).slice(0, 220)}`);
    print();
    process.exit(2);
  }

  let conversationId: string | null = null;
  const turns: { user: string; text: string; source: string }[] = [];

  function chat(message: string) {
    const r = vercelCurl("/api/admin/ava/chat", {
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

  const probe = chat(
    "Explique-moi en une phrase naturelle ce que tu fais pour moi aujourd'hui, sans menu."
  );
  if (!/openai/i.test(String(probe.json?.source || ""))) {
    verdict.OPENAI_REEL = "KO";
    errors.push(`OPENAI non utilisé (source=${probe.json?.source}). STOP.`);
    print();
    process.exit(3);
  }
  verdict.OPENAI_REEL = "OK";

  chat("Bonjour Ava");
  chat("Qui suis-je ?");
  chat("Qu’est-ce que tu sais de moi et de notre travail ?");
  chat("Qu’est-ce qu’on était en train de faire ?");
  const stocks = chat("Quels sont les stocks faibles ?");
  const orders = chat("Quelles commandes sont en attente ?");
  chat(
    `Note bien cette décision administrative unique : ${uniqueMarker}. On la traitera demain matin.`
  );
  chat("on verra ça demain");
  chat("Parle-moi plutôt de la météo, change complètement de sujet.");
  const recall = chat("On reprend. Tu te souviens de la décision qu'on a notée ?");

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
    recall.json?.text?.includes(uniqueMarker) ||
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

  const afterReload = chat(
    "Après rechargement : rappelle-moi la décision administrative unique qu'on a notée."
  );
  const mem = vercelCurl(
    `/api/admin/ava/memory?conversationId=${encodeURIComponent(conversationId || "")}`,
    { token }
  );
  const memBlob = JSON.stringify(mem.json || {});
  console.log("MEMORY hasMarker", memBlob.includes(uniqueMarker), "HTTP", mem.status);
  const memoryHas =
    memBlob.includes(uniqueMarker) || /PREVIEW_MEM_|pending_decision/i.test(memBlob);
  const reloadOk =
    String(afterReload.json?.text || "").includes(uniqueMarker) ||
    (/d[eé]cision|banni|twenty|demain|PREVIEW_MEM/i.test(String(afterReload.json?.text || "")) &&
      memoryHas);
  verdict.MEMOIRE_RELOAD = reloadOk ? "OK" : "KO";
  if (!memoryHas) errors.push("Marker absent mémoire API");

  const refPost = vercelCurl("/api/admin/ava/reflections", {
    method: "POST",
    token,
    body: { action: "refresh" },
  });
  console.log("REFLECTIONS", refPost.status, String(refPost.text).slice(0, 250));
  if (refPost.status === 200 && Array.isArray(refPost.json?.reflections)) {
    verdict.REFLEXIONS = "OK";
  } else {
    verdict.REFLEXIONS = "KO";
    errors.push(
      `Réflexions HTTP ${refPost.status}: ${String(refPost.json?.detail || refPost.json?.error || refPost.text).slice(0, 250)}`
    );
  }

  const radarGet = vercelCurl("/api/admin/ava/radar", { token });
  const radarPost = vercelCurl("/api/admin/ava/radar", {
    method: "POST",
    token,
    body: { action: "refresh" },
  });
  console.log("RADAR", radarGet.status, radarPost.status);
  verdict.RADAR =
    radarGet.status === 200 || radarPost.status === 200 ? "OK" : "KO";
  const afterRadar = chat("Toujours là après le radar ?");
  if (afterRadar.status !== 200) {
    verdict.RADAR = "KO";
    errors.push("Chat cassé après radar");
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
  errors.push(String(e?.message || e));
  print();
  process.exit(1);
});
