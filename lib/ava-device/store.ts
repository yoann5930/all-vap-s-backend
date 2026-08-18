/**
 * Store appareil — mémoire locale, ou AppSetting Prisma par clé sur Vercel.
 * Jamais de table client / inventaire / employé. Une clé JSON unique
 * écraserait jobs vs heartbeat entre lambdas : d'où des clés séparées.
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
const MAX_SHOTS = 1;
const PREFIX = "ava.device.";

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
  dataBase64: string;
};

type Snapshot = {
  devices: Record<string, EnrolledDevice>;
  jobs: Record<string, AvaDeviceJob>;
  heartbeats: Record<string, AvaDeviceHeartbeat>;
  approvals: Record<string, ApprovalRecord>;
  shots: Record<string, ScreenshotRecord>;
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

function usePrismaStore() {
  if (process.env.AVA_DEVICE_STORE_MEMORY === "1") return false;
  return Boolean(process.env.VERCEL) || process.env.AVA_DEVICE_STORE_PRISMA === "true";
}

function filePath(): string {
  return join(process.cwd(), "data", "ava-device-registry.json");
}

function emptySnap(): Snapshot {
  return { devices: {}, jobs: {}, heartbeats: {}, approvals: {}, shots: {} };
}

function toSnapshot(): Snapshot {
  return {
    devices: Object.fromEntries(bucket().devices),
    jobs: Object.fromEntries(bucket().jobs),
    heartbeats: Object.fromEntries(bucket().heartbeats),
    approvals: Object.fromEntries(bucket().approvals),
    shots: Object.fromEntries(bucket().shots),
  };
}

function fromSnapshot(snap: Snapshot | null | undefined) {
  const b = bucket();
  b.devices.clear();
  b.jobs.clear();
  b.heartbeats.clear();
  b.approvals.clear();
  b.shots.clear();
  if (!snap) return;
  for (const [k, v] of Object.entries(snap.devices || {})) b.devices.set(k, v);
  for (const [k, v] of Object.entries(snap.jobs || {})) b.jobs.set(k, v);
  for (const [k, v] of Object.entries(snap.heartbeats || {})) b.heartbeats.set(k, v);
  for (const [k, v] of Object.entries(snap.approvals || {})) b.approvals.set(k, v);
  for (const [k, v] of Object.entries(snap.shots || {})) b.shots.set(k, v);
}

async function prisma() {
  return (await import("@/lib/prisma")).default;
}

async function prismaGet<T>(key: string): Promise<T | null> {
  try {
    const row = await (await prisma()).appSetting.findUnique({ where: { key } });
    if (!row?.valueJson || typeof row.valueJson !== "object") return null;
    return row.valueJson as T;
  } catch {
    return null;
  }
}

async function prismaPut(key: string, value: object) {
  const client = await prisma();
  await client.appSetting.upsert({
    where: { key },
    create: { key, valueJson: value as object, updatedBy: "ava-device-gateway" },
    update: { valueJson: value as object, updatedBy: "ava-device-gateway" },
  });
}

async function prismaDel(key: string) {
  try {
    await (await prisma()).appSetting.deleteMany({ where: { key } });
  } catch {
    /* ignore */
  }
}

async function prismaList(prefix: string): Promise<{ key: string; value: unknown }[]> {
  try {
    const rows = await (await prisma()).appSetting.findMany({
      where: { key: { startsWith: prefix } },
    });
    return rows.map((r) => ({ key: r.key, value: r.valueJson }));
  } catch {
    return [];
  }
}

function loadFileSnap(): Snapshot {
  try {
    if (existsSync(filePath())) {
      return JSON.parse(readFileSync(filePath(), "utf8")) as Snapshot;
    }
  } catch {
    /* empty */
  }
  return emptySnap();
}

function saveFileSnap(snap: Snapshot) {
  try {
    mkdirSync(dirname(filePath()), { recursive: true });
    writeFileSync(filePath(), JSON.stringify(snap), "utf8");
  } catch {
    /* ignore */
  }
}

function hydrateMemoryFromFile() {
  fromSnapshot(loadFileSnap());
}

function persistMemoryFile() {
  pruneJobsMem();
  pruneShotsMem();
  saveFileSnap(toSnapshot());
}

function pruneJobsMem() {
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

function pruneShotsMem() {
  const now = Date.now();
  for (const [id, s] of bucket().shots) {
    if (now - Date.parse(s.createdAt) > SCREEN_TTL_MS) bucket().shots.delete(id);
  }
  while (bucket().shots.size > MAX_SHOTS) {
    const oldest = [...bucket().shots.values()].sort(
      (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
    )[0];
    if (oldest) bucket().shots.delete(oldest.id);
    else break;
  }
}

function jobExpired(job: AvaDeviceJob) {
  return Date.now() - Date.parse(job.createdAt) > JOB_TTL_MS;
}

export function newJobId(): string {
  return `job_${randomBytes(8).toString("hex")}`;
}

export async function putEnrolledDevice(rec: EnrolledDevice) {
  if (usePrismaStore()) {
    await prismaPut(`${PREFIX}enrolled.${rec.deviceId}`, rec);
    return;
  }
  hydrateMemoryFromFile();
  bucket().devices.set(rec.deviceId, rec);
  persistMemoryFile();
}

export async function getEnrolledDevice(deviceId: string): Promise<EnrolledDevice | null> {
  if (usePrismaStore()) {
    return prismaGet<EnrolledDevice>(`${PREFIX}enrolled.${deviceId}`);
  }
  hydrateMemoryFromFile();
  return bucket().devices.get(deviceId) ?? null;
}

export async function touchDeviceTimestamp(deviceId: string, ts: number): Promise<boolean> {
  const d = await getEnrolledDevice(deviceId);
  if (!d) return false;
  if (ts <= d.lastTimestamp) return false;
  d.lastTimestamp = ts;
  await putEnrolledDevice(d);
  return true;
}

export async function setRemoteAccessEnabled(deviceId: string, enabled: boolean) {
  const d = await getEnrolledDevice(deviceId);
  if (!d) return;
  d.remoteAccessEnabled = enabled;
  await putEnrolledDevice(d);
}

export async function putJob(job: AvaDeviceJob): Promise<AvaDeviceJob> {
  if (usePrismaStore()) {
    await prismaPut(`${PREFIX}job.${job.jobId}`, job);
    return job;
  }
  hydrateMemoryFromFile();
  pruneJobsMem();
  bucket().jobs.set(job.jobId, job);
  persistMemoryFile();
  return job;
}

export async function getJob(jobId: string): Promise<AvaDeviceJob | null> {
  if (usePrismaStore()) {
    const job = await prismaGet<AvaDeviceJob>(`${PREFIX}job.${jobId}`);
    if (!job) return null;
    if (jobExpired(job)) {
      await prismaDel(`${PREFIX}job.${jobId}`);
      return null;
    }
    return job;
  }
  hydrateMemoryFromFile();
  pruneJobsMem();
  return bucket().jobs.get(jobId) ?? null;
}

export async function updateJob(jobId: string, patch: Partial<AvaDeviceJob>): Promise<AvaDeviceJob | null> {
  const job = await getJob(jobId);
  if (!job) return null;
  const next = { ...job, ...patch, updatedAt: new Date().toISOString() };
  await putJob(next);
  return next;
}

export async function nextQueuedJob(deviceId: string): Promise<AvaDeviceJob | null> {
  let jobs: AvaDeviceJob[] = [];
  if (usePrismaStore()) {
    const rows = await prismaList(`${PREFIX}job.`);
    jobs = rows
      .map((r) => r.value as AvaDeviceJob)
      .filter((j) => j?.jobId && j.deviceId === deviceId);
    for (const j of jobs) {
      if (jobExpired(j)) await prismaDel(`${PREFIX}job.${j.jobId}`);
    }
    jobs = jobs.filter((j) => !jobExpired(j));
  } else {
    hydrateMemoryFromFile();
    pruneJobsMem();
    jobs = [...bucket().jobs.values()].filter((j) => j.deviceId === deviceId);
  }
  const queued = jobs
    .filter((j) => j.status === "queued")
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  return queued[0] ?? null;
}

export async function putHeartbeat(hb: AvaDeviceHeartbeat) {
  if (usePrismaStore()) {
    await prismaPut(`${PREFIX}hb.${hb.deviceId}`, hb);
    return;
  }
  hydrateMemoryFromFile();
  bucket().heartbeats.set(hb.deviceId, hb);
  persistMemoryFile();
}

export async function getHeartbeat(deviceId: string): Promise<AvaDeviceHeartbeat | null> {
  let hb: AvaDeviceHeartbeat | null = null;
  if (usePrismaStore()) {
    hb = await prismaGet<AvaDeviceHeartbeat>(`${PREFIX}hb.${deviceId}`);
  } else {
    hydrateMemoryFromFile();
    hb = bucket().heartbeats.get(deviceId) ?? null;
  }
  if (!hb) return null;
  const last = hb.lastSeen ? Date.parse(hb.lastSeen) : 0;
  return { ...hb, online: Date.now() - last < ONLINE_MS };
}

export async function hasRecentOperatorActivity(deviceId: string): Promise<boolean> {
  let jobs: AvaDeviceJob[] = [];
  if (usePrismaStore()) {
    const rows = await prismaList(`${PREFIX}job.`);
    jobs = rows.map((r) => r.value as AvaDeviceJob).filter((j) => j?.deviceId === deviceId);
  } else {
    hydrateMemoryFromFile();
    pruneJobsMem();
    jobs = [...bucket().jobs.values()].filter((j) => j.deviceId === deviceId);
  }
  return jobs.some(
    (j) =>
      Date.now() - Date.parse(j.createdAt) < ONLINE_MS &&
      (j.status === "queued" || j.status === "dispatched"),
  );
}

export async function putApproval(rec: ApprovalRecord) {
  if (usePrismaStore()) {
    await prismaPut(`${PREFIX}apr.${rec.approvalId}`, rec);
    return;
  }
  hydrateMemoryFromFile();
  bucket().approvals.set(rec.approvalId, rec);
  persistMemoryFile();
}

export async function consumeApproval(
  approvalId: string,
  deviceId: string,
  command: AvaDeviceCommand,
): Promise<boolean> {
  let rec: ApprovalRecord | null = null;
  if (usePrismaStore()) {
    rec = await prismaGet<ApprovalRecord>(`${PREFIX}apr.${approvalId}`);
  } else {
    hydrateMemoryFromFile();
    rec = bucket().approvals.get(approvalId) ?? null;
  }
  if (!rec || rec.used) return false;
  if (rec.deviceId !== deviceId || rec.command !== command) return false;
  if (Date.now() - Date.parse(rec.createdAt) > APPROVAL_TTL_MS) {
    if (usePrismaStore()) await prismaDel(`${PREFIX}apr.${approvalId}`);
    else {
      bucket().approvals.delete(approvalId);
      persistMemoryFile();
    }
    return false;
  }
  rec.used = true;
  await putApproval(rec);
  return true;
}

export async function putScreenshot(shot: ScreenshotRecord) {
  if (usePrismaStore()) {
    const existing = await prismaList(`${PREFIX}shot.`);
    for (const row of existing) {
      const s = row.value as ScreenshotRecord;
      if (!s?.createdAt || Date.now() - Date.parse(s.createdAt) > SCREEN_TTL_MS) {
        await prismaDel(row.key);
      }
    }
    const fresh = (await prismaList(`${PREFIX}shot.`)).sort(
      (a, b) =>
        Date.parse((a.value as ScreenshotRecord).createdAt) -
        Date.parse((b.value as ScreenshotRecord).createdAt),
    );
    while (fresh.length >= MAX_SHOTS) {
      const old = fresh.shift();
      if (old) await prismaDel(old.key);
    }
    await prismaPut(`${PREFIX}shot.${shot.id}`, shot);
    return;
  }
  hydrateMemoryFromFile();
  pruneShotsMem();
  bucket().shots.set(shot.id, shot);
  persistMemoryFile();
}

export async function getScreenshot(id: string): Promise<ScreenshotRecord | null> {
  let s: ScreenshotRecord | null = null;
  if (usePrismaStore()) {
    s = await prismaGet<ScreenshotRecord>(`${PREFIX}shot.${id}`);
    if (!s) return null;
    if (Date.now() - Date.parse(s.createdAt) > SCREEN_TTL_MS) {
      await prismaDel(`${PREFIX}shot.${id}`);
      return null;
    }
    return s;
  }
  hydrateMemoryFromFile();
  s = bucket().shots.get(id) ?? null;
  if (!s) return null;
  if (Date.now() - Date.parse(s.createdAt) > SCREEN_TTL_MS) {
    bucket().shots.delete(id);
    persistMemoryFile();
    return null;
  }
  return s;
}

export async function resetAvaDeviceStoreForTests() {
  bucket().devices.clear();
  bucket().jobs.clear();
  bucket().heartbeats.clear();
  bucket().approvals.clear();
  bucket().shots.clear();
  saveFileSnap(emptySnap());
}

export { ONLINE_MS };
export type { AvaDeviceJobStatus };
