/**
 * Sessions de test isolées — mémoire process + fichier local optionnel.
 * Jamais de table client, jamais de VapeProfile réel.
 *
 * Un resumeToken HMAC permet de continuer la session entre instances
 * serverless sans écrire dans Prisma.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { hmacKeyForSessions } from "@/lib/ava-test/auth";
import type { AvaTestSessionRecord } from "@/lib/ava-test/types";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SESSIONS = 200;

type StoreFile = { sessions: Record<string, AvaTestSessionRecord> };

const g = globalThis as typeof globalThis & {
  __avaTestSessions?: Map<string, AvaTestSessionRecord>;
};

function mem(): Map<string, AvaTestSessionRecord> {
  if (!g.__avaTestSessions) g.__avaTestSessions = new Map();
  return g.__avaTestSessions;
}

function filePath(): string {
  return join(process.cwd(), "data", "ava-test-sessions.json");
}

function expired(rec: AvaTestSessionRecord): boolean {
  const t = Date.parse(rec.updatedAt || rec.createdAt);
  if (!Number.isFinite(t)) return true;
  return Date.now() - t > SESSION_TTL_MS;
}

function loadFile(): StoreFile {
  try {
    const p = filePath();
    if (!existsSync(p)) return { sessions: {} };
    const raw = JSON.parse(readFileSync(p, "utf8")) as StoreFile;
    return raw && typeof raw.sessions === "object" ? raw : { sessions: {} };
  } catch {
    return { sessions: {} };
  }
}

function saveFile(store: StoreFile) {
  try {
    const p = filePath();
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(store), "utf8");
  } catch {
    /* serverless / read-only FS : mémoire uniquement */
  }
}

function persistMemToFile() {
  const sessions: Record<string, AvaTestSessionRecord> = {};
  for (const [id, rec] of mem()) {
    if (!expired(rec)) sessions[id] = rec;
  }
  const keys = Object.keys(sessions);
  if (keys.length > MAX_SESSIONS) {
    const sorted = keys.sort(
      (a, b) => Date.parse(sessions[a].updatedAt) - Date.parse(sessions[b].updatedAt),
    );
    for (const id of sorted.slice(0, keys.length - MAX_SESSIONS)) {
      delete sessions[id];
      mem().delete(id);
    }
  }
  saveFile({ sessions });
}

function hydrateFromFile() {
  const file = loadFile();
  for (const [id, rec] of Object.entries(file.sessions || {})) {
    if (!expired(rec) && !mem().has(id)) mem().set(id, rec);
  }
}

export function getTestSession(sessionId: string): AvaTestSessionRecord | null {
  hydrateFromFile();
  const rec = mem().get(sessionId);
  if (!rec || expired(rec)) {
    if (rec) mem().delete(sessionId);
    return null;
  }
  return rec;
}

export function putTestSession(rec: AvaTestSessionRecord): AvaTestSessionRecord {
  const next = { ...rec, updatedAt: new Date().toISOString() };
  mem().set(rec.sessionId, next);
  persistMemToFile();
  return next;
}

export function deleteTestSession(sessionId: string): boolean {
  hydrateFromFile();
  const had = mem().delete(sessionId);
  const file = loadFile();
  const fileHad = Boolean(file.sessions[sessionId]);
  if (fileHad) {
    delete file.sessions[sessionId];
    saveFile(file);
  }
  return had || fileHad;
}

export function signSessionResume(rec: AvaTestSessionRecord): string {
  const key = hmacKeyForSessions();
  if (!key) return "";
  const payload = Buffer.from(JSON.stringify(rec), "utf8").toString("base64url");
  const mac = createHmac("sha256", key).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

export function readSessionResume(token: string | undefined): AvaTestSessionRecord | null {
  if (!token || !token.includes(".")) return null;
  const key = hmacKeyForSessions();
  if (!key) return null;
  const dot = token.lastIndexOf(".");
  const payload = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = createHmac("sha256", key).update(payload).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const rec = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AvaTestSessionRecord;
    if (!rec?.sessionId || expired(rec)) return null;
    return rec;
  } catch {
    return null;
  }
}

/** Tests uniquement. */
export function resetAvaTestSessionStoreForTests() {
  mem().clear();
  try {
    saveFile({ sessions: {} });
  } catch {
    /* ignore */
  }
}
