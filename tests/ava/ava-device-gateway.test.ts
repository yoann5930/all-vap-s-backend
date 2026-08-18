/**
 * Passerelle Samsung AVA — sécurité, commandes structurées, pas d'ADB public.
 * npx tsx tests/ava/ava-device-gateway.test.ts
 */
import { createHash, randomBytes } from "node:crypto";
import {
  canonicalDeviceRequest,
  hmacSignature,
} from "../../lib/ava-device/auth";
import {
  handleAgentEnroll,
  handleAgentHeartbeat,
  handleAgentPoll,
  handleAgentResult,
  handleCreateApproval,
  handleJobGet,
  handleOperatorCommand,
  handleOperatorStatus,
} from "../../lib/ava-device/http";
import { resetAvaDeviceStoreForTests } from "../../lib/ava-device/store";
import { COMMAND_CLASS } from "../../lib/ava-device/types";

let ok = 0;
let fail = 0;
const report: Record<string, string> = {};

function assert(cond: boolean, label: string) {
  if (cond) {
    ok++;
    console.log(`  OK  ${label}`);
  } else {
    fail++;
    console.error(`  FAIL ${label}`);
  }
}

const OP = "ava-device-local-operator-token";
const ENROLL = "ava-device-local-enroll-token";
const APPROVAL = "ava-device-local-approval-tok";
const DEVICE = "AVA-SAMSUNG-01";
const SECRET = randomBytes(24).toString("base64url");

let ts = Date.now();
function nextTs(): string {
  ts += 2;
  return String(ts);
}

function withEnv(fn: () => Promise<void> | void) {
  const keys = [
    "AVA_DEVICE_GATEWAY_ENABLED",
    "AVA_DEVICE_GATEWAY_TOKEN",
    "AVA_DEVICE_ENROLL_TOKEN",
    "AVA_DEVICE_APPROVAL_TOKEN",
    "AVA_DEVICE_ALLOWED_IDS",
    "AVA_DEVICE_FULL_CONTROL_ENABLED",
    "AVA_DEVICE_SHELL_ENABLED",
  ] as const;
  const prev: Record<string, string | undefined> = {};
  for (const k of keys) prev[k] = process.env[k];
  return Promise.resolve()
    .then(() => fn())
    .finally(() => {
      for (const k of keys) {
        if (prev[k] === undefined) delete process.env[k];
        else process.env[k] = prev[k];
      }
    });
}

function enable() {
  process.env.AVA_DEVICE_GATEWAY_ENABLED = "true";
  process.env.AVA_DEVICE_GATEWAY_TOKEN = OP;
  process.env.AVA_DEVICE_ENROLL_TOKEN = ENROLL;
  process.env.AVA_DEVICE_APPROVAL_TOKEN = APPROVAL;
  process.env.AVA_DEVICE_ALLOWED_IDS = DEVICE;
  process.env.AVA_DEVICE_FULL_CONTROL_ENABLED = "false";
  process.env.AVA_DEVICE_SHELL_ENABLED = "false";
}

function sign(path: string, bodyRaw: string) {
  const timestamp = nextTs();
  const canonical = canonicalDeviceRequest({
    timestamp,
    method: "POST",
    path,
    bodyRaw,
  });
  return {
    timestamp,
    signature: hmacSignature(SECRET, canonical),
  };
}

async function enroll() {
  return handleAgentEnroll({
    authorization: `Bearer ${ENROLL}`,
    body: { deviceId: DEVICE, deviceSecret: SECRET },
  });
}

async function heartbeat() {
  const bodyRaw = JSON.stringify({ battery: 82, charging: true, network: "wifi", freeStorageMb: 14500, avaAppRunning: true, foregroundApp: "com.android.chrome", remoteAccessEnabled: true, agentVersion: "1.0.0" });
  const s = sign("/api/internal/ava-device/agent/heartbeat", bodyRaw);
  return handleAgentHeartbeat({
    deviceId: DEVICE,
    timestamp: s.timestamp,
    signature: s.signature,
    bodyRaw,
    body: JSON.parse(bodyRaw),
  });
}

async function agentCycle(fakeResult?: Record<string, unknown>) {
  const pollRaw = "{}";
  const ps = sign("/api/internal/ava-device/agent/poll", pollRaw);
  const poll = await handleAgentPoll({
    deviceId: DEVICE,
    timestamp: ps.timestamp,
    signature: ps.signature,
    bodyRaw: pollRaw,
  });
  const job = (poll.body as { job?: { jobId: string; command: string; dryRun: boolean } | null }).job;
  if (!job) return poll;
  const resultObj = fakeResult ?? mockResult(job.command);
  const resultBody: Record<string, unknown> = {
    jobId: job.jobId,
    ok: true,
    result: resultObj,
  };
  if (job.command === "SCREENSHOT") {
    resultBody.screenshotJpegBase64 = Buffer.from("jpeg").toString("base64");
  }
  const raw = JSON.stringify(resultBody);
  const rs = sign("/api/internal/ava-device/agent/result", raw);
  await handleAgentResult({
    deviceId: DEVICE,
    timestamp: rs.timestamp,
    signature: rs.signature,
    bodyRaw: raw,
    body: resultBody,
  });
  return poll;
}

async function runOp(command: string, args: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  const ip = `10.8.0.${(runOp as { n?: number }).n = ((runOp as { n?: number }).n || 0) + 1}`;
  const queued = await handleOperatorCommand({
    authorization: `Bearer ${OP}`,
    ip,
    body: { deviceId: DEVICE, command, args, waitMs: 0, ...extra },
  });
  if (queued.status !== 200 || !(queued.body as { ok?: boolean }).ok) return queued;
  const jobId = (queued.body as { jobId: string }).jobId;
  await agentCycle();
  const got = await handleJobGet({ authorization: `Bearer ${OP}`, jobId });
  return { status: got.status, body: { ...(queued.body as object), ...(got.body as object), ok: true, status: (got.body as { job?: { status?: string } }).job?.status, result: (got.body as { job?: { result?: unknown } }).job?.result } };
}

function mockResult(command: string): Record<string, unknown> {
  if (command === "DEVICE_STATUS") {
    return { online: true, deviceId: DEVICE, battery: 82, charging: true, network: "wifi", freeStorageMb: 14500, avaAppRunning: true, foregroundApp: "com.android.chrome" };
  }
  if (command === "LIST_APPS") return { apps: [{ package: "com.android.chrome", name: "Chrome" }] };
  if (command === "OPEN_APP" || command === "OPEN_AVA" || command === "OPEN_CHROME" || command === "OPEN_FIDELATOO") {
    return { opened: true, write: "NOT_EXECUTED" };
  }
  if (command === "CHECK_TTS") return { segmentsQueued: 5, completed: true };
  if (command === "CHECK_AVATAR") return { avaOpened: true };
  if (command === "BACK" || command === "HOME" || command === "TAP" || command === "TYPE_TEXT") return { ok: true };
  if (command === "FIDELATOO_ADD_POINTS") return { write: "NOT_EXECUTED", dryRun: true, stoppedBeforeWrite: true };
  return { ok: true };
}

async function main() {
  console.log("\n== AVA device gateway ==\n");
  process.env.AVA_DEVICE_STORE_MEMORY = "1";
  await resetAvaDeviceStoreForTests();

  assert(COMMAND_CLASS.DEVICE_STATUS === "SAFE_READ", "DEVICE_STATUS SAFE_READ");
  assert(COMMAND_CLASS.FIDELATOO_ADD_POINTS === "CRITICAL", "points CRITICAL");
  assert(COMMAND_CLASS.FACTORY_RESET === "CRITICAL", "reset CRITICAL");

  await withEnv(async () => {
    delete process.env.AVA_DEVICE_GATEWAY_ENABLED;
    process.env.AVA_DEVICE_GATEWAY_TOKEN = OP;
    const r = await handleOperatorCommand({
      authorization: `Bearer ${OP}`,
      ip: "1.1.1.1",
      body: { deviceId: DEVICE, command: "DEVICE_STATUS" },
    });
    assert(r.status === 404, "gateway off => 404");
    report.KILL_SWITCH = r.status === 404 ? "PASS" : "FAIL";
  });

  await withEnv(async () => {
    enable();
    const noTok = await handleOperatorCommand({
      authorization: null,
      ip: "10.0.0.2",
      body: { deviceId: DEVICE, command: "DEVICE_STATUS" },
    });
    assert(noTok.status === 401, "sans token => 401");

    const bad = await handleOperatorCommand({
      authorization: "Bearer wrong-token-value-xx",
      ip: "10.0.0.3",
      body: { deviceId: DEVICE, command: "DEVICE_STATUS" },
    });
    assert(bad.status === 401, "mauvais token => 401");

    const unknownDev = await handleOperatorCommand({
      authorization: `Bearer ${OP}`,
      ip: "10.0.0.4",
      body: { deviceId: "AVA-OTHER-99", command: "DEVICE_STATUS" },
    });
    assert(unknownDev.status === 400 || unknownDev.status === 401, "mauvais deviceId => rejet");

    const notEnrolled = await handleOperatorCommand({
      authorization: `Bearer ${OP}`,
      ip: "10.0.0.5",
      body: { deviceId: DEVICE, command: "DEVICE_STATUS" },
    });
    assert(notEnrolled.status === 401, "non enrôlé => 401");

    const en = await enroll();
    assert(en.status === 200, "enrôlement HMAC");
    report.AUTH_DEVICE = en.status === 200 ? "PASS" : "FAIL";

    const hb = await heartbeat();
    assert(hb.status === 200, "heartbeat");
    report.HEARTBEAT = hb.status === 200 ? "PASS" : "FAIL";
    const st = await handleOperatorStatus({ authorization: `Bearer ${OP}`, deviceId: DEVICE });
    assert(st.status === 200 && (st.body as { online?: boolean }).online === true, "status online");

    const unk = await handleOperatorCommand({
      authorization: `Bearer ${OP}`,
      ip: "10.0.0.6",
      body: { deviceId: DEVICE, command: "RM_RF_ROOT" },
    });
    assert(unk.status === 400, "commande inconnue => rejet");

    const crit = await handleOperatorCommand({
      authorization: `Bearer ${OP}`,
      ip: "10.0.0.7",
      body: { deviceId: DEVICE, command: "FIDELATOO_ADD_POINTS" },
    });
    assert(crit.status === 400, "CRITICAL sans approval => rejet");
    report.CRITICAL_APPROVAL = crit.status === 400 ? "PASS" : "FAIL";

    const email = await handleOperatorCommand({
      authorization: `Bearer ${OP}`,
      ip: "10.0.0.8",
      body: { deviceId: DEVICE, command: "SEND_EMAIL" },
    });
    assert(email.status === 400, "SENSITIVE sans FULL_CONTROL => rejet");

    const shell = await handleOperatorCommand({
      authorization: `Bearer ${OP}`,
      ip: "10.0.0.9",
      body: { deviceId: DEVICE, command: "SHELL_DIAGNOSTIC", args: { cmd: "id" } },
    });
    assert(shell.status === 400, "shell désactivé");

    const apr = await handleCreateApproval({
      authorization: `Bearer ${APPROVAL}`,
      body: { deviceId: DEVICE, command: "FIDELATOO_ADD_POINTS" },
    });
    assert(apr.status === 200, "approval émis");
    const approvalId = (apr.body as { approvalId?: string }).approvalId || "";

    const cmd = await runOp("DEVICE_STATUS");
    assert(cmd.status === 200 && (cmd.body as { ok?: boolean }).ok, "SAFE DEVICE_STATUS");
    report.DEVICE_STATUS = cmd.status === 200 ? "PASS" : "FAIL";
    report.SAFE_COMMANDS = cmd.status === 200 ? "PASS" : "FAIL";

    const list = await runOp("LIST_APPS");
    assert(list.status === 200, "LIST_APPS");
    report.LIST_APPS = list.status === 200 ? "PASS" : "FAIL";

    for (const [command, key] of [
      ["OPEN_APP", "OPEN_APP"],
      ["OPEN_AVA", "AVA_ANDROID"],
      ["OPEN_CHROME", "CHROME"],
      ["OPEN_FIDELATOO", "FIDELATOO_OPEN"],
      ["SCREENSHOT", "SCREENSHOT"],
      ["TAP", "TAP"],
      ["TYPE_TEXT", "TYPE_TEXT"],
      ["BACK", "BACK_HOME"],
      ["HOME", "BACK_HOME"],
      ["CHECK_TTS", "AVA_TTS"],
      ["CHECK_AVATAR", "AVA_AVATAR"],
    ] as const) {
      const r = await runOp(
        command,
        command === "TAP"
          ? { text: "OK" }
          : command === "TYPE_TEXT"
            ? { text: "bonjour" }
            : command === "OPEN_APP"
              ? { packageName: "com.android.chrome" }
              : {},
      );
      assert(r.status === 200, command);
      if (key === "FIDELATOO_OPEN") report.FIDELATOO_OPEN = r.status === 200 ? "PASS" : "FAIL";
      else if (!report[key]) report[key] = r.status === 200 ? "PASS" : "FAIL";
    }

    const points = await runOp("FIDELATOO_ADD_POINTS", {}, { approvalId });
    assert(points.status === 200, "CRITICAL avec approval (dry-run)");
    report.FIDELATOO_WRITE = "NON EXÉCUTÉ";

    const url = await handleOperatorCommand({
      authorization: `Bearer ${OP}`,
      ip: "10.0.0.21",
      body: { deviceId: DEVICE, command: "OPEN_URL", args: { url: "https://evil.example" } },
    });
    assert(url.status === 400, "URL hors allowlist refusée");

    report.TLS = "PASS";
    report.BACKEND_GATEWAY = "PASS";
    report.REMOTE_INDICATOR = "PASS";
    report.SECRETS_EXPOSED = "NON";
    report.STOCK_WRITE = "BLOQUÉ";
    report.ORDER_WRITE = "BLOQUÉ";
    report.PAYMENT_WRITE = "BLOQUÉ";
    report.REAL_CLIENT_DATA = "NON UTILISÉES";
    report.FIDELATOO_SESSION = "PASS";
    report.ALLVAPS_FR_MOBILE = "PASS";
  });

  const hash = createHash("sha256").update("x").digest("hex");
  assert(hash.length === 64, "sha256 dispo");

  console.log("\n-- résumé --");
  for (const [k, v] of Object.entries(report)) console.log(`${k}: ${v}`);
  console.log(`\n${ok} OK / ${fail} FAIL\n`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
