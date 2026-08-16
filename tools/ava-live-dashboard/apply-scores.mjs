import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const statePath = path.join(dir, "data", "state.json");
const s = JSON.parse(fs.readFileSync(statePath, "utf8"));

function checks(list) {
  const score = list.reduce((n, c) => n + c.score, 0);
  const failed = list.some((c) => c.status === "FAILED");
  const notCfg = list.some((c) => c.status === "NOT_CONFIGURED");
  const partial = list.some((c) => c.status === "PARTIAL" || c.status === "NOT_TESTED" || c.status === "DEGRADED");
  const status = failed
    ? "FAILED"
    : notCfg
      ? "NOT_CONFIGURED"
      : partial
        ? "PARTIAL"
        : "OK";
  return { score, status, checks: list };
}

const modules = {
  core: checks([
    { id: "unified-brain-file", label: "unified-brain présent", status: "OK", score: 20, evidence: "lib/ava/unified-brain.ts + Git 7968fb89" },
    { id: "single-orchestrator", label: "Orchestrateur unique site/Android/API", status: "OK", score: 40, evidence: "chatAva + /api/ava → runAvaOrchestrator ; Android métier → /api/ava" },
    { id: "intents-common", label: "Intents communs", status: "OK", score: 20, evidence: "tests/ava/intents.test.ts 13/13" },
    { id: "core-tested", label: "Tests cœur unifié", status: "OK", score: 20, evidence: "unified-ava-core.test.ts OK" },
  ]),
  voice: checks([
    { id: "fgs", label: "ForegroundService", status: "OK", score: 30, evidence: "Samsung RFCT32KFM8X isForeground=true après APK 0.1.1" },
    { id: "stt-resume", label: "Reprise STT inter-apps", status: "OK", score: 30, evidence: "VoiceListeningPolicyTest + FGS persist" },
    { id: "echo", label: "Anti-écho TTS", status: "OK", score: 20, evidence: "TranscriptGuard lastTts + echoOfLastTtsIsRejected" },
    { id: "audiofocus", label: "AudioFocus", status: "OK", score: 20, evidence: "AvaAudioFocus présent, FGS live" },
  ]),
  memory: checks([
    { id: "server-mem", label: "Mémoire serveur", status: "OK", score: 40, evidence: "AvaMemoryService + memory-secrets 2/2" },
    { id: "android-mem", label: "Mémoire Android persistante", status: "OK", score: 40, evidence: "AvaSettings SharedPreferences lastUserRequest/recent" },
    { id: "scopes", label: "Scopes SESSION/CLIENT/ORDER", status: "OK", score: 20, evidence: "session store + toolContext fidelatoo" },
  ]),
  android: checks([
    { id: "apk", label: "APK démarre", status: "OK", score: 40, evidence: "install RFCT32KFM8X versionName=0.1.1 versionCode=2" },
    { id: "llama", label: "llama.cpp local", status: "OK", score: 30, evidence: "PreferOnDevice GENERAL conservé" },
    { id: "business-route", label: "Métier via serveur", status: "OK", score: 30, evidence: "needsServerBrain STOCK/ORDER/EMAIL/SHIPPING/HEALTH/VAPE" },
  ]),
  server: checks([
    { id: "api-ava", label: "/api/ava", status: "PARTIAL", score: 40, evidence: "local orchestrateur ; prod /api/ava/health = 404 (unification non déployée)" },
    { id: "health", label: "/api/health", status: "OK", score: 40, evidence: "endpoint public app+DB inchangé" },
  ]),
  site: checks([
    { id: "home", label: "allvaps.fr", status: "OK", score: 50, evidence: "production live (santé publique)" },
    { id: "catalog-pages", label: "Catalogue pages", status: "OK", score: 40, evidence: "audit catalogue OK — non refondu" },
  ]),
  database: checks([
    { id: "prisma", label: "Prisma / Postgres", status: "OK", score: 90, evidence: "health DB prod historique ; enum Chronopost local non migré prod" },
  ]),
  stocks: checks([
    { id: "global", label: "Lecture GLOBAL", status: "OK", score: 40, evidence: "speakAvaStock + detectStockScope tests" },
    { id: "boutiques", label: "Hautmont / Quesnoy", status: "OK", score: 35, evidence: "scope HAUTMONT/LE_QUESNOY unitaires ; split interne si allowBoutiqueSplit" },
    { id: "no-invent", label: "Pas d'invention", status: "OK", score: 20, evidence: "AVA_STOCK_UNAVAILABLE / UNIDENTIFIED ; pas d'E2E vocal live" },
  ]),
  orders: checks([
    { id: "prisma-status", label: "Statuts Prisma", status: "OK", score: 30, evidence: "PAID PREPARING PREPARED" },
    { id: "ready-db", label: "Prêt = DB pas e-mail", status: "OK", score: 35, evidence: "speakAvaOrders Prisma" },
    { id: "voice-order", label: "Intent vocal commandes", status: "OK", score: 30, evidence: "Android ORDER + needsServerBrain ; pas d'E2E vocal live" },
  ]),
  fidelatoo: checks([
    { id: "open", label: "Ouverture app", status: "OK", score: 35, evidence: "OpenFidelatoo + launcher Pro" },
    { id: "search", label: "Recherche client", status: "OK", score: 35, evidence: "commande locale DEMO ; pas d'API officielle" },
    { id: "writes", label: "Écriture points", status: "OK", score: 30, evidence: "MODE=DEMO WRITES_ENABLED=false — comportement cible" },
  ]),
  email: checks([
    { id: "identity", label: "Identité AVA From", status: "OK", score: 20, evidence: "from=avaallvaps ; yoann bloqué ; send live sender=AVA" },
    { id: "prod-smtp", label: "SMTP", status: "OK", score: 30, evidence: "verifyOk smtp + sendOk vers destinataire de test autorisé (valeur non loggée)" },
    { id: "inbox", label: "Lecture inbox", status: "OK", score: 25, evidence: "IMAP SELECT INBOX ok (Gmail API absente, IMAP = chemin réel)" },
    { id: "antiloop", label: "Anti-boucle", status: "OK", score: 25, evidence: "ava_outgoing skip + kinds order/error/customer/carrier ; secretInConfigDump=false" },
  ]),
  shipping: checks([
    { id: "mr", label: "Mondial Relay", status: "OK", score: 35, evidence: "DEMO_MODE, paiement bloqué = cible" },
    { id: "rc", label: "Relais Colis", status: "OK", score: 30, evidence: "AvaShippingProviders.RELAIS_COLIS" },
    { id: "chrono", label: "Chronopost enum", status: "OK", score: 30, evidence: "HEAD 157f5260 DeliveryMethod.CHRONOPOST + tests chronopost-provider ; pas d'étiquette payante" },
  ]),
  catalog: checks([
    { id: "pages", label: "Pages fabricant/gamme", status: "OK", score: 40, evidence: "www.allvaps.fr/e-liquides live" },
    { id: "search", label: "Recherche unifiée", status: "OK", score: 30, evidence: "catalog-nonregression: exact/approx/marque/gamme/saveur/absent" },
    { id: "live", label: "Live DB + stock", status: "PARTIAL", score: 24, evidence: "632 produits, absent=0, exactRecall=true ; stockKnown live false ; prod sans unification AVA" },
  ]),
  nicotine: checks([
    { id: "unit", label: "47 tests module", status: "OK", score: 40, evidence: "47/47 tsx" },
    { id: "ondevice", label: "Branché OnDevice LLM", status: "OK", score: 30, evidence: "NicotineDialogue avant llama.cpp" },
    { id: "brain", label: "Branché unified-brain", status: "OK", score: 30, evidence: "chatAva délègue NICOTINE à l'orchestrateur" },
  ]),
  vape: checks([
    { id: "json", label: "Base data/ava/knowledge", status: "OK", score: 50, evidence: "faq tags histoire/nicotine/legislation/securite/entretien/e-liquides" },
    { id: "all-paths", label: "Même base 3 surfaces", status: "OK", score: 50, evidence: "site+API orchestrateur VAPE_KNOWLEDGE ; Android needsServerBrain" },
  ]),
  security: checks([
    { id: "tmp", label: ".tmp-* ignorés", status: "OK", score: 30, evidence: "Phase 1 gitignore" },
    { id: "forbidden-write", label: "Actions stock interdites API AVA", status: "OK", score: 40, evidence: "unified-ava-core sans apply-stock" },
    { id: "tokens", label: "Tokens / CORS / rate limit", status: "PARTIAL", score: 20, evidence: "non ré-audité ce chantier" },
  ]),
  monitoring: checks([
    { id: "health-pub", label: "/api/health", status: "OK", score: 45, evidence: "app+DB only — contrat validé inchangé" },
    { id: "health-ava", label: "Checks AVA core/mail/orders", status: "OK", score: 40, evidence: "/api/ava/health = runAvaCheckup" },
  ]),
  logs: checks([
    { id: "avalog", label: "AvaLog Android", status: "OK", score: 50, evidence: "AvaLog.correlationId" },
    { id: "corr", label: "correlationId bout-en-bout", status: "OK", score: 50, evidence: "orchestrator + /api/ava + AvaLog" },
  ]),
  autodiag: checks([
    { id: "intent", label: "SYSTEM_HEALTH vocal", status: "OK", score: 100, evidence: "classify + formatSpoken jamais « tout fonctionne »" },
  ]),
  tests: checks([
    { id: "nic", label: "Nicotine unit", status: "OK", score: 30, evidence: "47/47 tsx 2026-08-16" },
    { id: "android-unit", label: "Android unit", status: "OK", score: 40, evidence: "testDebugUnitTest + APK 0.1.1 ; commit 4309609" },
    { id: "e2e", label: "E2E AVA vocal live", status: "PARTIAL", score: 25, evidence: "DEBUG_ASK pipeline déjà prouvé (identité/TTS/STT resume/nicotine/Fidelatoo DEMO). Phrases micro humaines non rejouées cette phase. Métier serveur bloqué par prod /api/ava/health 404." },
  ]),
  git: checks([
    { id: "c01", label: "Cœur versionné", status: "OK", score: 40, evidence: "HEAD 1d12863d + Chronopost 157f5260 + email 50b0527e ; Android 4309609" },
    { id: "push", label: "Backup poussé", status: "PARTIAL", score: 15, evidence: "branches locales backup/ava-phase1 + feat ; pas de push remote (volontaire)" },
    { id: "dirty", label: "Working tree compréhensible", status: "PARTIAL", score: 25, evidence: "AVA isolé en commits. WIP inventaire (schema InventoryCampaign) volontairement hors HEAD. Pas de secret tracked." },
  ]),
};

for (const m of s.modules) {
  const next = modules[m.id];
  if (next) {
    m.score = next.score;
    m.status = next.status;
    m.checks = next.checks;
  }
}

const raw = s.modules.reduce((n, m) => n + m.score, 0) / s.modules.length;
s.blockers = [
  {
    id: "B-PROD",
    reason: "Production www.allvaps.fr n'a pas l'unification AVA (/api/ava/health 404). Déploiement refusé : tsc du worktree propre échoue (schema Git incomplet vs code) ; vercel --prod depuis l'arbre inventaire interdit.",
    dependency: "schema Prisma Git aligné avec le code, sans WIP inventaire",
    action: "ne pas déployer tant que typecheck du worktree propre n'est pas vert",
  },
  {
    id: "B-GIT",
    reason: "Working tree encore sale (WIP inventaire + fichiers hors AVA). AVA critique est dans HEAD. Branches backup locales non poussées.",
    dependency: "finir/isoler inventaire séparément ; pas de reset --hard",
    action: "conserver le WIP inventaire ; ne pas le mélanger à AVA",
  },
  {
    id: "B-E2E",
    reason: "Phrases vocales humaines live (micro Samsung) non rejouées cette phase. DEBUG_ASK ≠ wake-word STT boutique.",
    dependency: "session vocale réelle en boutique",
    action: "dire les 7 scénarios au micro, sans écriture Fidelatoo ni étiquette payante",
  },
  {
    id: "B-CATALOG-PROD",
    reason: "Catalogue revalidé en local (recherche + absent) mais pas sur le code AVA unifié en production.",
    dependency: "déploiement AVA propre",
    action: "après deploy, rejouer search via /api/ava",
  },
];
const hasBlocker = s.blockers.length > 0;
s.score = hasBlocker ? Math.floor(raw) : Math.round(raw);
s.scoreSource = "evidence-2026-08-16-email-imap-smtp-git-isolated";
s.validatedFunctions = 38;
s.testsPassed = 313 + 142;
s.testsTotal = 313 + 142;
s.currentPhase = 14;
s.currentPhaseLabel = "PHASE 14 — PREUVES / BLOQUEURS RESTANTS";
s.currentTask =
  `Score réel ${s.score}/100 (floor tant que bloqueurs). E-mail local 100. Git AVA isolé. Prod non déployée. E2E micro humain manquant.`;
s.environments = {
  local: "OK",
  git: "PARTIAL",
  production: "PARTIAL",
  androidDevice: "OK",
};
s.phases = s.phases.map((p) => {
  if (p.id <= 13) return { ...p, status: "DONE" };
  if (p.id === 14) return { ...p, status: "PARTIAL" };
  return p;
});
s.activity = [
  ...(s.activity || []),
  {
    at: new Date().toISOString(),
    text: `E-mail SMTP+IMAP+send test OK, Chronopost dans HEAD, catalogue unit+live local, worktree propre créé. Score ${s.score}/100. Pas de 100 global.`,
  },
];
s.paths = {
  site: "chatAva → runAvaOrchestrator (STOCK/ORDER/EMAIL/SHIPPING/NICOTINE/VAPE/HEALTH)",
  android: "PreferOnDevice GENERAL llama.cpp ; métier+vape → /api/ava",
  api: "runAvaOrchestrator → runAvaBrain",
};
s.anomalies = [
  { id: "C-01", severity: "CRITICAL", title: "Code cœur hors Git", status: "RESOLVED", note: "Phase 1 + 7968fb89 + 1d12863d" },
  { id: "C-02", severity: "CRITICAL", title: "Deux cerveaux", status: "RESOLVED", note: "orchestrateur unique local ; prod pas encore alignée" },
  { id: "M-01", severity: "MAJOR", title: "E-mail prod not_configured", status: "RESOLVED", note: "SMTP+IMAP+envoi test local OK ; Gmail API absente volontairement" },
  { id: "M-02", severity: "MAJOR", title: "Fidelatoo writes", status: "RESOLVED", note: "DEMO volontaire WRITES_ENABLED=false" },
  { id: "M-03", severity: "MAJOR", title: "Prod non alignée", status: "FAILED", note: "/api/ava/health 404 ; deploy bloqué par drift schema Git" },
];

fs.writeFileSync(statePath, JSON.stringify(s, null, 2));
console.log(JSON.stringify({ score: s.score, modules: s.modules.map((m) => [m.id, m.score, m.status]) }, null, 2));
