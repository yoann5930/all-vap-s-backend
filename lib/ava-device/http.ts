import { randomBytes } from "node:crypto";
import { checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod";
import {
  authorizeApprovalIssuer,
  authorizeEnroll,
  authorizeOperator,
  canonicalDeviceRequest,
  hmacSignature,
  isAllowedDeviceId,
  isAvaDeviceGatewayEnabled,
  isValidDeviceId,
  safeEqualString,
} from "@/lib/ava-device/auth";
import { avaDeviceLog } from "@/lib/ava-device/log";
import { commandClass, evaluateCommandPolicy, parseCommand } from "@/lib/ava-device/policy";
import { runBeginnerScenarioOnServer, mobileTestSessionId } from "@/lib/ava-device/scenarios";
import {
  consumeApproval,
  getEnrolledDevice,
  getHeartbeat,
  getJob,
  getScreenshot,
  hasRecentOperatorActivity,
  newJobId,
  nextQueuedJob,
  putApproval,
  putEnrolledDevice,
  putHeartbeat,
  putJob,
  putScreenshot,
  setRemoteAccessEnabled,
  touchDeviceTimestamp,
  updateJob,
} from "@/lib/ava-device/store";
import type {
  AvaDeviceCommand,
  AvaDeviceErrorCode,
  AvaDeviceHeartbeat,
  AvaDeviceJob,
  AvaDeviceResponse,
} from "@/lib/ava-device/types";

const RATE = 40;
const WINDOW = 5 * 60 * 1000;
const HEARTBEAT_SKEW_MS = 60_000;

function err(
  errorCode: AvaDeviceErrorCode,
  message: string,
): { status: number; body: Extract<AvaDeviceResponse, { ok: false }> } {
  const status =
    errorCode === "AVA_DEVICE_DISABLED"
      ? 404
      : errorCode === "AVA_DEVICE_UNAUTHORIZED" || errorCode === "AVA_DEVICE_NOT_ENROLLED"
        ? 401
        : errorCode === "AVA_DEVICE_RATE_LIMITED"
          ? 429
          : errorCode === "AVA_DEVICE_CRITICAL_APPROVAL_REQUIRED" ||
              errorCode === "AVA_DEVICE_SENSITIVE_BLOCKED" ||
              errorCode === "AVA_DEVICE_FULL_CONTROL_DISABLED" ||
              errorCode === "AVA_DEVICE_SHELL_DISABLED" ||
              errorCode === "AVA_DEVICE_AUTH_STOP" ||
              errorCode === "AVA_DEVICE_UNKNOWN_COMMAND" ||
              errorCode === "AVA_DEVICE_INVALID_REQUEST"
            ? 400
            : 400;
  return { status, body: { ok: false, errorCode, message } };
}

function operatorDenied(authorization: string | null | undefined) {
  const auth = authorizeOperator(authorization);
  if (auth.ok) return null;
  return { status: auth.status, body: { ok: false as const, errorCode: auth.errorCode, message: auth.message } };
}

const operatorSchema = z.object({
  deviceId: z.string().min(3).max(48),
  command: z.string().min(2).max(48),
  args: z.record(z.unknown()).optional(),
  approvalId: z.string().max(80).optional(),
  waitMs: z.number().int().min(0).max(20_000).optional(),
  dryRun: z.boolean().optional(),
  scenario: z.string().max(40).optional(),
});

function nowJob(
  deviceId: string,
  command: AvaDeviceCommand,
  args: Record<string, unknown>,
  approvalId: string | null,
  requester: string,
  dryRun: boolean,
): AvaDeviceJob {
  const ts = new Date().toISOString();
  return {
    jobId: newJobId(),
    deviceId,
    command,
    args,
    class: commandClass(command),
    approvalId,
    dryRun,
    requester,
    status: "queued",
    result: null,
    errorCode: null,
    createdAt: ts,
    updatedAt: ts,
  };
}

async function waitForJob(jobId: string, waitMs: number): Promise<AvaDeviceJob | null> {
  const start = Date.now();
  while (Date.now() - start < waitMs) {
    const job = await getJob(jobId);
    if (job && (job.status === "done" || job.status === "error" || job.status === "rejected")) return job;
    await new Promise((r) => setTimeout(r, 250));
  }
  return await getJob(jobId);
}

export async function handleOperatorCommand(params: {
  authorization: string | null | undefined;
  ip: string;
  body: unknown;
}): Promise<{ status: number; body: AvaDeviceResponse | Record<string, unknown>; retryAfterSec?: number }> {
  const denied = operatorDenied(params.authorization);
  if (denied) return denied;

  const rl = checkRateLimit(`ava-device-op:${params.ip || "unknown"}`, RATE, WINDOW);
  if (!rl.ok) {
    return { status: 429, retryAfterSec: rl.retryAfterSec, ...err("AVA_DEVICE_RATE_LIMITED", "Trop de requêtes") };
  }

  const parsed = operatorSchema.safeParse(params.body);
  if (!parsed.success) return err("AVA_DEVICE_INVALID_REQUEST", "Requête invalide");

  const deviceId = parsed.data.deviceId.trim();
  if (!isValidDeviceId(deviceId) || !isAllowedDeviceId(deviceId)) {
    return err("AVA_DEVICE_UNKNOWN", "Appareil non enregistré");
  }
  if (!(await getEnrolledDevice(deviceId))) {
    return err("AVA_DEVICE_NOT_ENROLLED", "Appareil non enrôlé");
  }

  const command = parseCommand(parsed.data.command);
  if (!command) return err("AVA_DEVICE_UNKNOWN_COMMAND", "Commande inconnue");

  const args = { ...(parsed.data.args || {}) };
  if (parsed.data.scenario) args.scenario = parsed.data.scenario;
  if (parsed.data.dryRun != null) args.dryRun = parsed.data.dryRun;

  const approvalOk = parsed.data.approvalId
    ? await consumeApproval(parsed.data.approvalId, deviceId, command)
    : false;

  const policy = evaluateCommandPolicy({
    command,
    args,
    approvalOk,
    typeText: String(args.text || ""),
  });
  if (!policy.ok) return err(policy.errorCode, policy.message);

  if (command === "RUN_AVA_SCENARIO") {
    const scenario = String(args.scenario || parsed.data.scenario || "");
    if (scenario !== "BEGINNER_20_CIGS") {
      return err("AVA_DEVICE_INVALID_REQUEST", "Scénario inconnu");
    }
    const testToken = process.env.AVA_TEST_API_TOKEN || "";
    const testAuth = testToken ? `Bearer ${testToken}` : params.authorization || "";
    const sessionId = mobileTestSessionId();
    const serverPart = await runBeginnerScenarioOnServer({
      operatorAuthorization: testAuth,
      sessionId,
    });
    args.serverScenario = serverPart;
    args.openAvaUrl = "https://www.allvaps.fr/ava";
  }

  const job = await putJob(
    nowJob(deviceId, command, args, parsed.data.approvalId ?? null, "operator", policy.dryRun),
  );
  avaDeviceLog("command", {
    deviceId,
    command,
    requester: "operator",
    status: job.status,
    approvalId: parsed.data.approvalId ? "set" : null,
  });

  const waitMs = parsed.data.waitMs ?? 0;
  const finished = waitMs > 0 ? await waitForJob(job.jobId, waitMs) : job;
  const current = finished || job;
  const started = Date.parse(job.createdAt);

  return {
    status: 200,
    body: {
      ok: true,
      deviceId,
      jobId: current.jobId,
      command: current.command,
      status: current.status,
      class: current.class,
      pending: current.status === "queued" || current.status === "dispatched",
      dryRun: current.dryRun,
      result: current.result,
      diagnostics: {
        route: "/api/internal/ava-device",
        writeScope: "READ_PLUS_SIMULATE",
        latencyMs: Date.now() - started,
        fidelatooWrite: "NOT_EXECUTED",
      },
    },
  };
}

export async function handleOperatorStatus(params: {
  authorization: string | null | undefined;
  deviceId: string;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const denied = operatorDenied(params.authorization);
  if (denied) return denied;
  const deviceId = params.deviceId.trim();
  if (!isValidDeviceId(deviceId) || !isAllowedDeviceId(deviceId)) {
    return err("AVA_DEVICE_UNKNOWN", "Appareil non enregistré");
  }
  const enrolledRow = await getEnrolledDevice(deviceId);
  const enrolled = Boolean(enrolledRow);
  const hb = await getHeartbeat(deviceId);
  return {
    status: 200,
    body: {
      ok: true,
      deviceId,
      enrolled,
      online: hb?.online ?? false,
      lastSeen: hb?.lastSeen ?? null,
      battery: hb?.battery ?? null,
      charging: hb?.charging ?? null,
      network: hb?.network ?? null,
      freeStorageMb: hb?.freeStorageMb ?? null,
      avaAppRunning: hb?.avaAppRunning ?? null,
      foregroundApp: hb?.foregroundApp ?? null,
      remoteAccessEnabled: hb?.remoteAccessEnabled ?? enrolledRow?.remoteAccessEnabled ?? null,
      remoteSessionActive: await hasRecentOperatorActivity(deviceId),
    },
  };
}

export async function handleCreateApproval(params: {
  authorization: string | null | undefined;
  body: unknown;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const auth = authorizeApprovalIssuer(params.authorization);
  if (!auth.ok) {
    return { status: auth.status, body: { ok: false, errorCode: auth.errorCode, message: auth.message } };
  }
  const schema = z.object({
    deviceId: z.string().min(3).max(48),
    command: z.string().min(2).max(48),
  });
  const parsed = schema.safeParse(params.body);
  if (!parsed.success) return err("AVA_DEVICE_INVALID_REQUEST", "Requête invalide");
  const command = parseCommand(parsed.data.command);
  if (!command) return err("AVA_DEVICE_UNKNOWN_COMMAND", "Commande inconnue");
  if (commandClass(command) !== "CRITICAL") {
    return err("AVA_DEVICE_INVALID_REQUEST", "L'approbation ne s'applique qu'aux commandes CRITICAL");
  }
  if (!isAllowedDeviceId(parsed.data.deviceId) || !isValidDeviceId(parsed.data.deviceId)) {
    return err("AVA_DEVICE_UNKNOWN", "Appareil non enregistré");
  }
  const approvalId = `apr_${randomBytes(12).toString("hex")}`;
  await putApproval({
    approvalId,
    deviceId: parsed.data.deviceId,
    command,
    createdAt: new Date().toISOString(),
    used: false,
  });
  avaDeviceLog("approval_created", { deviceId: parsed.data.deviceId, command, status: "issued" });
  return { status: 200, body: { ok: true, approvalId, ttlSec: 300, command, deviceId: parsed.data.deviceId } };
}

async function verifyDeviceHmac(params: {
  deviceId: string;
  timestamp: string | null;
  signature: string | null;
  method: string;
  path: string;
  bodyRaw: string;
}): Promise<{ ok: true } | { ok: false; status: number; errorCode: AvaDeviceErrorCode; message: string }> {
  if (!isAvaDeviceGatewayEnabled()) {
    return { ok: false, status: 404, errorCode: "AVA_DEVICE_DISABLED", message: "Not found" };
  }
  if (!params.deviceId || !isValidDeviceId(params.deviceId) || !isAllowedDeviceId(params.deviceId)) {
    return { ok: false, status: 401, errorCode: "AVA_DEVICE_UNKNOWN", message: "Appareil inconnu" };
  }
  const enrolled = await getEnrolledDevice(params.deviceId);
  if (!enrolled) {
    return { ok: false, status: 401, errorCode: "AVA_DEVICE_NOT_ENROLLED", message: "Appareil non enrôlé" };
  }
  if (!enrolled.remoteAccessEnabled) {
    return { ok: false, status: 403, errorCode: "AVA_DEVICE_DISABLED", message: "Accès distant coupé sur l'appareil" };
  }
  const ts = Number(params.timestamp || "0");
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > HEARTBEAT_SKEW_MS) {
    return { ok: false, status: 401, errorCode: "AVA_DEVICE_UNAUTHORIZED", message: "Horodatage invalide" };
  }
  const canonical = canonicalDeviceRequest({
    timestamp: String(ts),
    method: params.method,
    path: params.path,
    bodyRaw: params.bodyRaw,
  });
  const expected = hmacSignature(enrolled.secret, canonical);
  if (!params.signature || !safeEqualString(params.signature, expected)) {
    return { ok: false, status: 401, errorCode: "AVA_DEVICE_UNAUTHORIZED", message: "Signature invalide" };
  }
  if (!(await touchDeviceTimestamp(params.deviceId, ts))) {
    return { ok: false, status: 401, errorCode: "AVA_DEVICE_UNAUTHORIZED", message: "Rejeu refusé" };
  }
  return { ok: true };
}

export async function handleAgentEnroll(params: {
  authorization: string | null | undefined;
  body: unknown;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const auth = authorizeEnroll(params.authorization);
  if (!auth.ok) {
    return { status: auth.status, body: { ok: false, errorCode: auth.errorCode, message: auth.message } };
  }
  const schema = z.object({
    deviceId: z.string().min(3).max(48),
    deviceSecret: z.string().min(24).max(128),
  });
  const parsed = schema.safeParse(params.body);
  if (!parsed.success) return err("AVA_DEVICE_INVALID_REQUEST", "Requête invalide");
  if (!isValidDeviceId(parsed.data.deviceId) || !isAllowedDeviceId(parsed.data.deviceId)) {
    return err("AVA_DEVICE_UNKNOWN", "Appareil non autorisé");
  }
  await putEnrolledDevice({
    deviceId: parsed.data.deviceId,
    secret: parsed.data.deviceSecret,
    enrolledAt: new Date().toISOString(),
    lastTimestamp: 0,
    remoteAccessEnabled: true,
  });
  avaDeviceLog("enroll", { deviceId: parsed.data.deviceId, result: "ok" });
  return { status: 200, body: { ok: true, deviceId: parsed.data.deviceId, enrolled: true } };
}

export async function handleAgentHeartbeat(params: {
  deviceId: string;
  timestamp: string | null;
  signature: string | null;
  bodyRaw: string;
  body: unknown;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const v = await verifyDeviceHmac({
    deviceId: params.deviceId,
    timestamp: params.timestamp,
    signature: params.signature,
    method: "POST",
    path: "/api/internal/ava-device/agent/heartbeat",
    bodyRaw: params.bodyRaw,
  });
  if (!v.ok) return { status: v.status, body: { ok: false, errorCode: v.errorCode, message: v.message } };

  const schema = z.object({
    battery: z.number().min(0).max(100).nullable().optional(),
    charging: z.boolean().nullable().optional(),
    network: z.string().max(40).nullable().optional(),
    freeStorageMb: z.number().nullable().optional(),
    avaAppRunning: z.boolean().nullable().optional(),
    foregroundApp: z.string().max(120).nullable().optional(),
    remoteAccessEnabled: z.boolean().optional(),
    agentVersion: z.string().max(20).optional(),
  });
  const parsed = schema.safeParse(params.body);
  if (!parsed.success) return err("AVA_DEVICE_INVALID_REQUEST", "Heartbeat invalide");
  if (parsed.data.remoteAccessEnabled === false) {
    await setRemoteAccessEnabled(params.deviceId, false);
  }
  const hb: AvaDeviceHeartbeat = {
    deviceId: params.deviceId,
    online: true,
    lastSeen: new Date().toISOString(),
    battery: parsed.data.battery ?? null,
    charging: parsed.data.charging ?? null,
    network: parsed.data.network ?? null,
    freeStorageMb: parsed.data.freeStorageMb ?? null,
    avaAppRunning: parsed.data.avaAppRunning ?? null,
    foregroundApp: parsed.data.foregroundApp ?? null,
    remoteAccessEnabled: parsed.data.remoteAccessEnabled ?? true,
    agentVersion: parsed.data.agentVersion ?? null,
  };
  await putHeartbeat(hb);
  return {
    status: 200,
    body: {
      ok: true,
      gatewayEnabled: isAvaDeviceGatewayEnabled(),
      remoteSessionActive: await hasRecentOperatorActivity(params.deviceId),
      killSwitch: !isAvaDeviceGatewayEnabled(),
    },
  };
}

export async function handleAgentPoll(params: {
  deviceId: string;
  timestamp: string | null;
  signature: string | null;
  bodyRaw: string;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const v = await verifyDeviceHmac({
    deviceId: params.deviceId,
    timestamp: params.timestamp,
    signature: params.signature,
    method: "POST",
    path: "/api/internal/ava-device/agent/poll",
    bodyRaw: params.bodyRaw,
  });
  if (!v.ok) return { status: v.status, body: { ok: false, errorCode: v.errorCode, message: v.message } };
  const job = await nextQueuedJob(params.deviceId);
  if (!job) {
    return {
      status: 200,
      body: { ok: true, job: null, remoteSessionActive: await hasRecentOperatorActivity(params.deviceId) },
    };
  }
  await updateJob(job.jobId, { status: "dispatched" });
  return {
    status: 200,
    body: {
      ok: true,
      remoteSessionActive: true,
      job: {
        jobId: job.jobId,
        command: job.command,
        args: job.args,
        dryRun: job.dryRun,
        class: job.class,
      },
    },
  };
}

export async function handleAgentResult(params: {
  deviceId: string;
  timestamp: string | null;
  signature: string | null;
  bodyRaw: string;
  body: unknown;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const v = await verifyDeviceHmac({
    deviceId: params.deviceId,
    timestamp: params.timestamp,
    signature: params.signature,
    method: "POST",
    path: "/api/internal/ava-device/agent/result",
    bodyRaw: params.bodyRaw,
  });
  if (!v.ok) return { status: v.status, body: { ok: false, errorCode: v.errorCode, message: v.message } };

  const schema = z.object({
    jobId: z.string().min(6).max(80),
    ok: z.boolean(),
    result: z.record(z.unknown()).optional(),
    errorCode: z.string().max(80).optional(),
    screenshotJpegBase64: z.string().max(1_500_000).optional(),
    authChallenge: z.boolean().optional(),
  });
  const parsed = schema.safeParse(params.body);
  if (!parsed.success) return err("AVA_DEVICE_INVALID_REQUEST", "Résultat invalide");
  const job = await getJob(parsed.data.jobId);
  if (!job || job.deviceId !== params.deviceId) {
    return err("AVA_DEVICE_INVALID_REQUEST", "Job introuvable");
  }
  if (parsed.data.authChallenge) {
    await updateJob(job.jobId, {
      status: "rejected",
      errorCode: "AVA_DEVICE_AUTH_STOP",
      result: { stopped: true, reason: "auth_challenge" },
    });
    avaDeviceLog("auth_stop", { deviceId: params.deviceId, command: job.command, status: "rejected" });
    return { status: 200, body: { ok: true, stopped: true } };
  }
  let result = parsed.data.result || {};
  if (parsed.data.screenshotJpegBase64) {
    const id = `shot_${randomBytes(6).toString("hex")}`;
    await putScreenshot({
      id,
      deviceId: params.deviceId,
      createdAt: new Date().toISOString(),
      mime: "image/jpeg",
      dataBase64: parsed.data.screenshotJpegBase64,
    });
    result = { ...result, screenshotId: id, screenshotExpiresSec: 600 };
  }
  const started = Date.parse(job.createdAt);
  await updateJob(job.jobId, {
    status: parsed.data.ok ? "done" : "error",
    result,
    errorCode: parsed.data.errorCode ?? null,
  });
  avaDeviceLog("result", {
    deviceId: params.deviceId,
    command: job.command,
    status: parsed.data.ok ? "done" : "error",
    duration: Date.now() - started,
  });
  return { status: 200, body: { ok: true, jobId: job.jobId } };
}

export async function handleJobGet(params: {
  authorization: string | null | undefined;
  jobId: string;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const denied = operatorDenied(params.authorization);
  if (denied) return denied;
  const job = await getJob(params.jobId);
  if (!job) return { status: 404, body: { ok: false, errorCode: "AVA_DEVICE_INVALID_REQUEST", message: "Job introuvable" } };
  return { status: 200, body: { ok: true, job } };
}

export async function handleScreenshotGet(params: {
  authorization: string | null | undefined;
  screenshotId: string;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const denied = operatorDenied(params.authorization);
  if (denied) return denied;
  const shot = await getScreenshot(params.screenshotId);
  if (!shot) {
    return { status: 404, body: { ok: false, errorCode: "AVA_DEVICE_INVALID_REQUEST", message: "Capture expirée" } };
  }
  return {
    status: 200,
    body: {
      ok: true,
      screenshotId: shot.id,
      mime: shot.mime,
      dataBase64: shot.dataBase64,
      createdAt: shot.createdAt,
      expiresSec: 600,
    },
  };
}
