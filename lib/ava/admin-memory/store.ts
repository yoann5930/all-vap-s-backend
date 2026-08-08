import { getAvaMemory, setAvaMemory } from "@/lib/ava/memory-store";
import type {
  AdminMemoryItem,
  AdminMemoryKind,
  AdminPersistentMemory,
  AdminSessionMemory,
  AdminTaskStatus,
} from "./types";

const FACTS_KEY = "structured_facts";
const sessionKey = (conversationId: string) => `session:${conversationId}`;

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function emptyPersistent(): AdminPersistentMemory {
  return { version: 1, items: [], updatedAt: nowIso() };
}

function emptySession(conversationId: string): AdminSessionMemory {
  return {
    version: 1,
    conversationId,
    summary: "",
    lastTopic: null,
    lastTools: [],
    openQuestions: [],
    recentActions: [],
    recentReplyFingerprints: [],
    updatedAt: nowIso(),
  };
}

function asPersistent(raw: unknown): AdminPersistentMemory {
  if (!raw || typeof raw !== "object") return emptyPersistent();
  const o = raw as Partial<AdminPersistentMemory>;
  if (!Array.isArray(o.items)) return emptyPersistent();
  return {
    version: 1,
    items: o.items as AdminMemoryItem[],
    updatedAt: o.updatedAt || nowIso(),
  };
}

function asSession(raw: unknown, conversationId: string): AdminSessionMemory {
  if (!raw || typeof raw !== "object") return emptySession(conversationId);
  const o = raw as Partial<AdminSessionMemory>;
  return {
    ...emptySession(conversationId),
    ...o,
    version: 1,
    conversationId,
    recentReplyFingerprints: Array.isArray(o.recentReplyFingerprints)
      ? o.recentReplyFingerprints
      : [],
    lastTools: Array.isArray(o.lastTools) ? o.lastTools : [],
    openQuestions: Array.isArray(o.openQuestions) ? o.openQuestions : [],
    recentActions: Array.isArray(o.recentActions) ? o.recentActions : [],
  };
}

export async function loadAdminPersistentMemory(
  ownerUserId: string
): Promise<AdminPersistentMemory> {
  try {
    const raw = await getAvaMemory({
      scope: "ADMIN",
      ownerUserId,
      key: FACTS_KEY,
    });
    return asPersistent(raw);
  } catch {
    return emptyPersistent();
  }
}

export async function saveAdminPersistentMemory(
  ownerUserId: string,
  mem: AdminPersistentMemory
): Promise<void> {
  await setAvaMemory({
    scope: "ADMIN",
    ownerUserId,
    key: FACTS_KEY,
    value: { ...mem, updatedAt: nowIso() },
    source: "admin_ava_memory",
  });
}

export async function loadAdminSessionMemory(
  ownerUserId: string,
  conversationId: string
): Promise<AdminSessionMemory> {
  try {
    const raw = await getAvaMemory({
      scope: "ADMIN",
      ownerUserId,
      key: sessionKey(conversationId),
    });
    return asSession(raw, conversationId);
  } catch {
    return emptySession(conversationId);
  }
}

export async function saveAdminSessionMemory(
  ownerUserId: string,
  session: AdminSessionMemory
): Promise<void> {
  await setAvaMemory({
    scope: "ADMIN",
    ownerUserId,
    key: sessionKey(session.conversationId),
    value: { ...session, updatedAt: nowIso() },
    source: "admin_ava_session",
  });
}

/** Vide uniquement les résumés de session (pas les faits persistants). */
export async function clearAdminConversationalMemory(
  ownerUserId: string,
  conversationId?: string | null
): Promise<void> {
  if (conversationId) {
    await setAvaMemory({
      scope: "ADMIN",
      ownerUserId,
      key: sessionKey(conversationId),
      value: emptySession(conversationId),
      source: "admin_ava_clear_session",
    });
  }
}

export async function upsertAdminMemoryItem(
  ownerUserId: string,
  input: {
    kind: AdminMemoryKind;
    subject: string;
    content: string;
    importance?: AdminMemoryItem["importance"];
    taskStatus?: AdminTaskStatus;
    project?: string;
    source?: AdminMemoryItem["source"];
  }
): Promise<AdminMemoryItem> {
  const mem = await loadAdminPersistentMemory(ownerUserId);
  const subject = input.subject.trim().toLowerCase();
  const existing = mem.items.find(
    (i) =>
      i.status === "active" &&
      i.subject.toLowerCase() === subject &&
      i.kind === input.kind
  );

  if (existing && existing.content === input.content) {
    return existing;
  }

  if (existing) {
    existing.status = "superseded";
    existing.updatedAt = nowIso();
  }

  const item: AdminMemoryItem = {
    id: newId(),
    kind: input.kind,
    subject: input.subject.trim(),
    content: input.content.trim().slice(0, 500),
    status: "active",
    importance: input.importance || "medium",
    taskStatus: input.taskStatus,
    project: input.project,
    source: input.source || "ava",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    supersededBy: null,
  };
  if (existing) existing.supersededBy = item.id;
  mem.items.unshift(item);
  // Cap : garder 120 items (actifs + supersédés récents)
  mem.items = mem.items.slice(0, 120);
  await saveAdminPersistentMemory(ownerUserId, mem);
  return item;
}

export async function supersedeAdminMemoryItem(
  ownerUserId: string,
  itemId: string,
  replacement: { content: string; source?: AdminMemoryItem["source"] }
): Promise<AdminMemoryItem | null> {
  const mem = await loadAdminPersistentMemory(ownerUserId);
  const old = mem.items.find((i) => i.id === itemId);
  if (!old) return null;
  old.status = "superseded";
  old.updatedAt = nowIso();
  const neu: AdminMemoryItem = {
    ...old,
    id: newId(),
    content: replacement.content.trim().slice(0, 500),
    status: "active",
    source: replacement.source || "correction",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    supersededBy: null,
  };
  old.supersededBy = neu.id;
  mem.items.unshift(neu);
  await saveAdminPersistentMemory(ownerUserId, mem);
  return neu;
}

export async function deleteAdminMemoryItem(
  ownerUserId: string,
  itemId: string
): Promise<boolean> {
  const mem = await loadAdminPersistentMemory(ownerUserId);
  const before = mem.items.length;
  mem.items = mem.items.filter((i) => i.id !== itemId);
  if (mem.items.length === before) return false;
  await saveAdminPersistentMemory(ownerUserId, mem);
  return true;
}

export async function setAdminMemoryImportance(
  ownerUserId: string,
  itemId: string,
  importance: AdminMemoryItem["importance"]
): Promise<boolean> {
  const mem = await loadAdminPersistentMemory(ownerUserId);
  const item = mem.items.find((i) => i.id === itemId);
  if (!item) return false;
  item.importance = importance;
  item.updatedAt = nowIso();
  await saveAdminPersistentMemory(ownerUserId, mem);
  return true;
}

export async function updateTaskBySubject(
  ownerUserId: string,
  subjectHint: string,
  taskStatus: AdminTaskStatus
): Promise<AdminMemoryItem | null> {
  const mem = await loadAdminPersistentMemory(ownerUserId);
  const hint = subjectHint.toLowerCase();
  const item =
    mem.items.find(
      (i) =>
        i.status === "active" &&
        (i.kind === "pending_decision" || i.taskStatus) &&
        (i.subject.toLowerCase().includes(hint) ||
          i.content.toLowerCase().includes(hint) ||
          (i.project || "").toLowerCase().includes(hint))
    ) ||
    mem.items.find(
      (i) =>
        i.status === "active" &&
        (i.kind === "pending_decision" || !!i.taskStatus) &&
        (taskStatus === "paused" || i.taskStatus === "paused" || i.taskStatus === "in_progress")
    );

  if (!item) {
    return upsertAdminMemoryItem(ownerUserId, {
      kind: "pending_decision",
      subject: subjectHint.slice(0, 80) || "projet",
      content: `Statut : ${taskStatus}`,
      taskStatus,
      importance: "high",
      source: "user",
      project: subjectHint.slice(0, 80) || undefined,
    });
  }

  item.taskStatus = taskStatus;
  item.updatedAt = nowIso();
  item.content = `${item.content.split("|")[0].trim()} | statut=${taskStatus}`;
  await saveAdminPersistentMemory(ownerUserId, mem);
  return item;
}

export function listActiveFacts(mem: AdminPersistentMemory): AdminMemoryItem[] {
  return mem.items.filter((i) => i.status === "active");
}
