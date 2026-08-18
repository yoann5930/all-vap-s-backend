/**
 * Store isolé : registry appareils, file de jobs, heartbeats, approvals, captures TTL.
 * Jamais de table client. Fichier gitignoré.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import type {
  AvaDeviceCommand,
  AvaDeviceHeartbeat,
  AvaDeviceJob,
  AvaDeviceJobStatus,
} from "@/lib/ava-device/types";

const JOB_TTL_MS = 15 * 60 * 1000;
const SCREEN_TTL_MS = 10 * 60 * 1000;
const APPROVAL_TTL_MS = 5 * 60 * 1000;
const ONLINE_MS = 45_000;
const MAX_JOBS = 80;
const MAX_SHOTS = 3;

export type EnrolledDevice = {
  deviceId: string;
  secret: string;
  enrolledAt: string;
  lastTimestamp: number;
  remoteAccessEnabled: boolean;
};

export type ApprovalRecord = {
  approvalId: string;
  deviceId: string;
  command: AvaDeviceCommand;
  createdAt: string;
  used: boolean;
};

export type ScreenshotRecord = {
  id: string;
  deviceId: string;
  createdAt: string;
  mime: string;
  /** JPEG compressé, jamais archivé. */
  dataBase64: string;
};

type FileShape = {
  devices: Record<string, EnrolledDevice>;
};

const g = globalThis as typeof globalThis & {
  __avaDeviceStore?: {
    devices: Map<string, EnrolledDevice>;
    jobs: Map<string, AvaDeviceJob>;
    heartbeats: Map<string, AvaDeviceHeartbeat>;
    approvals: Map<string, ApprovalRecord>;
    shots: Map<string, ScreenshotRecord>;
  };
};

function bucket() {
  if (!g.__avaDeviceStore) {
    g.__avaDeviceStore = {
      devices: new Map(),
      jobs: new Map(),
      heartbeats: new Map(),
      approvals: new Map(),
      shots: new Map(),
    };
  }
  return g.__avaDeviceStore;
}

function filePath(): string {
  return join(process.cwd(), "data", "ava-device-registry.json");
}

function loadFile(): FileShape {
  try {
    const p = filePath();
    if (!existsSync(p)) return { devices: {} };
    const raw = JSON.parse(readFileSync(p, "utf8")) as FileShape;
    return raw?.devices ? raw : { devices: {} };
  } catch {
    return { devices: {} };
  }
}

function saveFile() {
  try {
    const devices: Record<string, EnrolledDevice> = {};
    for (const [id, d] of bucket().devices) {
      devices[id] = { ...d, secret: d.secret };
    }
    const p = filePath();
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify({ devices }), "utf8");
  } catch {
    /* serverless read-only */
  }
}

function hydrateDevices() {
  if (bucket().devices.size) return;
  const file = loadFile();
  for (const [id, d] of Object.entries(file.devices || {})) {
    bucket().devices.set(id, d);
  }
}

export function putEnrolledDevice(rec: EnrolledDevice) {
  hydrateDevices();
  bucket().devices.set(rec.deviceId, rec);
  saveFile();
}

export function getEnrolledDevice(deviceId: string): EnrolledDevice | null {
  hydrateDevices();
  return bucket().devices.get(deviceId) ?? null;
}

export function touchDeviceTimestamp(deviceId: string, ts: number): boolean {
  const d = getEnrolledDevice(deviceId);
  if (!d) return false;
  if (ts <= d.lastTimestamp) return false;
  d.lastTimestamp = ts;
  bucket().devices.set(deviceId, d);
  saveFile();
  return true;
}

export function setRemoteAccessEnabled(deviceId: string, enabled: boolean) {
  const d = getEnrolledDevice(deviceId);
  if (!d) return;
  d.remoteAccessEnabled = enabled;
  bucket().devices.set(deviceId, d);
  saveFile();
}

function pruneJobs() {
  const now = Date.now();
  for (const [id, job] of bucket().jobs) {
    if (now - Date.parse(job.createdAt) > JOB_TTL_MS) bucket().jobs.delete(id);
  }
  if (bucket().jobs.size > MAX_JOBS) {
    const sorted = [...bucket().jobs.values()].sort(
      (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
    );
    for (const extra of sorted.slice(0, bucket().jobs.size - MAX_JOBS)) {
      bucket().jobs.delete(extra.jobId);
    }
  }
}

export function newJobId(): string {
  return `job_${randomBytes(8).toString("hex")}`;
}

export function putJob(job: AvaDeviceJob): AvaDeviceJob {
  pruneJobs();
  bucket().jobs.set(job.jobId, job);
  return job;
}

export function getJob(jobId: string): AvaDeviceJob | null {
  pruneJobs();
  return bucket().jobs.get(jobId) ?? null;
}

export function updateJob(
  jobId: string,
  patch: Partial<AvaDeviceJob>,
): AvaDeviceJob | null {
  const job = getJob(jobId);
  if (!job) return null;
  const next = { ...job, ...patch, updatedAt: new Date().toISOString() };
  bucket().jobs.set(jobId, next);
  return next;
}

export function nextQueuedJob(deviceId: string): AvaDeviceJob | null {
  pruneJobs();
  const queued = [...bucket().jobs.values()]
    .filter((j) => j.deviceId === deviceId && j.status === "queued")
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  return queued[0] ?? null;
}

export function putHeartbeat(hb: AvaDeviceHeartbeat) {
  bucket().heartbeats.set(hb.deviceId, hb);
}

export function getHeartbeat(deviceId: string): AvaDeviceHeartbeat | null {
  const hb = bucket().heartbeats.get(deviceId);
  if (!hb) return null;
  const last = hb.lastSeen ? Date.parse(hb.lastSeen) : 0;
  const online = Date.now() - last < ONLINE_MS;
  return { ...hb, online };
}

export function hasRecentOperatorActivity(deviceId: string): boolean {
  pruneJobs();
  return [...bucket().jobs.values()].some(
    (j) =>
      j.deviceId === deviceId &&
      Date.now() - Date.parse(j.createdAt) < ONLINE_MS &&
      (j.status === "queued" || j.status === "dispatched"),
  );
}

export function putApproval(rec: ApprovalRecord) {
  bucket().approvals.set(rec.approvalId, rec);
}

export function consumeApproval(approvalId: string, deviceId: string, command: AvaDeviceCommand): boolean {
  const rec = bucket().approvals.get(approvalId);
  if (!rec || rec.used) return false;
  if (rec.deviceId !== deviceId || rec.command !== command) return false;
  if (Date.now() - Date.parse(rec.createdAt) > APPROVAL_TTL_MS) {
    bucket().approvals.delete(approvalId);
    return false;
  }
  rec.used = true;
  bucket().approvals.set(approvalId, rec);
  return true;
}

export function putScreenshot(shot: ScreenshotRecord) {
  const now = Date.now();
  for (const [id, s] of bucket().shots) {
    if (now - Date.parse(s.createdAt) > SCREEN_TTL_MS) bucket().shots.delete(id);
  }
  while (bucket().shots.size >= MAX_SHOTS) {
    const oldest = [...bucket().shots.values()].sort(
      (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
    )[0];
    if (oldest) bucket().shots.delete(oldest.id);
    else break;
  }
  bucket().shots.set(shot.id, shot);
}

export function getScreenshot(id: string): ScreenshotRecord | null {
  const s = bucket().shots.get(id);
  if (!s) return null;
  if (Date.now() - Date.parse(s.createdAt) > SCREEN_TTL_MS) {
    bucket().shots.delete(id);
    return null;
  }
  return s;
}

export function resetAvaDeviceStoreForTests() {
  bucket().devices.clear();
  bucket().jobs.clear();
  bucket().heartbeats.clear();
  bucket().approvals.clear();
  bucket().shots.clear();
  try {
    saveFile();
  } catch {
    /* ignore */
  }
}

export { ONLINE_MS };
export type { AvaDeviceJobStatus };
