/**
 * Sécurité native All Vap's (sans Nexus) — CORS, CSRF, rate-limit, télémétrie.
 * npx tsx tests/security/native-security.test.ts
 */
import { checkRateLimit } from "../../lib/rate-limit";
import { isAllowedOrigin } from "../../lib/security-origins";
import { escapeHtml } from "../../lib/security";
import { resolveRequestId } from "../../lib/ops/request-id";
import {
  emitOpsEvent,
  isSensitiveOpsKey,
  NEXUS_EVENT_NAMES,
  opsEventFromKnownApiError,
  sanitizeOpsMetadata,
} from "../../lib/ops/telemetry";
import { permissionsPolicyForPath } from "../../lib/ai/web-voice-permissions";

let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string) {
  if (cond) {
    passed++;
    console.log(`  OK  ${label}`);
  } else {
    failed++;
    console.error(`  FAIL ${label}`);
  }
}

console.log("\n=== Native security (All Vap's) ===\n");

assert(
  isAllowedOrigin("https://evil.example", "www.allvaps.fr") === false,
  "CORS — origine étrangère refusée"
);
assert(
  isAllowedOrigin("https://www.allvaps.fr", "www.allvaps.fr") === true,
  "CORS — www.allvaps.fr autorisé"
);
assert(
  isAllowedOrigin("https://inventaire.allvaps.fr", "inventaire.allvaps.fr") === true,
  "CORS — inventaire.allvaps.fr autorisé"
);

const key = `test:${Date.now()}:${Math.random()}`;
const first = checkRateLimit(key, 2, 60_000);
const second = checkRateLimit(key, 2, 60_000);
const third = checkRateLimit(key, 2, 60_000);
assert(first.ok && second.ok && !third.ok, "Rate-limit — 3e appel bloqué (limite 2)");

assert(escapeHtml("<script>x</script>").includes("&lt;script&gt;"), "XSS — escapeHtml");

const req = new Request("https://www.allvaps.fr/api/health", {
  headers: { "x-request-id": "client-req-12345" },
});
assert(resolveRequestId(req) === "client-req-12345", "requestId — réutilise le header client");
assert(
  resolveRequestId(new Request("https://www.allvaps.fr/")).length >= 8,
  "requestId — génère un id si absent"
);

assert(isSensitiveOpsKey("password") && isSensitiveOpsKey("apiKey"), "clés sensibles détectées");
const meta = sanitizeOpsMetadata({
  password: "secret-value",
  token: "abc",
  cookie: "sid=1",
  reason: "invalid_credentials",
  status: 401,
});
assert(meta?.reason === "invalid_credentials", "télémétrie conserve reason");
assert(meta?.password === undefined && meta?.token === undefined, "télémétrie masque secrets");

const auth = opsEventFromKnownApiError("INVALID_CREDENTIALS");
assert(auth?.event === "AUTH_FAILURE", "INVALID_CREDENTIALS → AUTH_FAILURE");
assert(opsEventFromKnownApiError("CSRF_REJECTED")?.event === "SUSPICIOUS_REQUEST", "CSRF → SUSPICIOUS");
assert(opsEventFromKnownApiError("RATE_LIMITED")?.event === "RATE_LIMIT_TRIGGERED", "429 → RATE_LIMIT");
assert(opsEventFromKnownApiError("AUTH_DB_UNAVAILABLE")?.event === "DATABASE_ERROR", "DB auth → DATABASE_ERROR");

const logged = emitOpsEvent({
  event: "AUTH_FAILURE",
  category: "security",
  severity: "warning",
  route: "/api/auth/login",
  metadata: { password: "nope", reason: "invalid_credentials" },
});
assert(logged.service === "allvaps", "événement service=allvaps");
assert(logged.metadata?.password === undefined, "emitOpsEvent ne journalise pas le mot de passe");
assert(NEXUS_EVENT_NAMES.includes("BRUTE_FORCE_PATTERN"), "catalogue d'événements Nexus déclaré (non détecté ici)");

assert(
  /microphone=\(self\)/.test(permissionsPolicyForPath("/")),
  "Policy publique — micro autorisé (AVA site)"
);
assert(
  /microphone=\(\)/.test(permissionsPolicyForPath("/inventaire")),
  "Policy inventaire — micro inchangé"
);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
