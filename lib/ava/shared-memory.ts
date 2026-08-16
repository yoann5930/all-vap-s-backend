/**
 * Mémoire centrale AVA (ava-main).
 * Ne remplace pas la mémoire ADMIN existante : lecture fusionnée, écriture partagée
 * uniquement pour les faits/préférences explicitement mémorisables.
 */
import { getAvaMemory, setAvaMemory } from "@/lib/ava/memory-store";
import { AVA_SYSTEM_ID } from "@/lib/ava/ava-core";
import type { AdminMemoryItem, AdminPersistentMemory } from "@/lib/ava/admin-memory/types";
import { OWNER_PRIMARY_EMAIL } from "@/lib/ava/identity-context";

const SHARED_FACTS_KEY = "shared_facts";
const sessionKey = (sessionId: string) => `session:${sessionId}`;

export type AvaPersonId = "yoann" | "nadege" | "kelly" | "aurelien" | "unknown";

export type AvaSharedSession = {
  version: 1;
  sessionId: string;
  turns: Array<{ role: "user" | "assistant"; content: string }>;
  lastProductQuery?: string;
  nicotineInterview?: import("@/lib/nicotine").NicotineInterviewState | null;
  updatedAt: string;
};

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function emptyPersistent(): AdminPersistentMemory {
  return { version: 1, items: [], updatedAt: nowIso() };
}

function asPersistent(raw: unknown): AdminPersistentMemory {
  if (!raw || typeof raw !== "object") return emptyPersistent();
  const o = raw as Partial<AdminPersistentMemory>;
  if (!Array.isArray(o.items)) return emptyPersistent();
  return { version: 1, items: o.items as AdminMemoryItem[], updatedAt: o.updatedAt || nowIso() };
}

const EMAIL_TO_PERSON: Record<string, AvaPersonId> = {
  [OWNER_PRIMARY_EMAIL]: "yoann",
  "yoann@allvaps.fr": "yoann",
};

export function personIdFromEmployee(employeeId?: string | null): AvaPersonId {
  const id = (employeeId || "").trim().toLowerCase();
  if (id === "yoann" || id === "nadege" || id === "kelly" || id === "aurelien") return id;
  return "unknown";
}

export function personIdFromEmail(email?: string | null): AvaPersonId {
  const e = (email || "").trim().toLowerCase();
  return EMAIL_TO_PERSON[e] || "unknown";
}

export function sharedOwnerKey(personId: AvaPersonId): string {
  return `${AVA_SYSTEM_ID}:${personId}`;
}

export async function loadSharedPersistentMemory(
  personId: AvaPersonId
): Promise<AdminPersistentMemory> {
  if (personId === "unknown") return emptyPersistent();
  try {
    const raw = await getAvaMemory({
      scope: "OPERATIONAL",
      ownerUserId: sharedOwnerKey(personId),
      key: SHARED_FACTS_KEY,
    });
    return asPersistent(raw);
  } catch (error) {
    console.warn("AVA_MEMORY_READ_ERROR AVA_MEMORY_ERROR scope=persistent");
    console.warn("AVA_MEMORY_READ_ERROR", error instanceof Error ? error.name : "unknown");
    return emptyPersistent();
  }
}

export function mergePersistentMemory(
  ...parts: AdminPersistentMemory[]
): AdminPersistentMemory {
  const byId = new Map<string, AdminMemoryItem>();
  const bySubject = new Map<string, AdminMemoryItem>();
  for (const part of parts) {
    for (const item of part.items) {
      if (item.status && item.status !== "active") continue;
      const existing = byId.get(item.id) || bySubject.get(item.subject);
      if (!existing || (item.updatedAt || "") > (existing.updatedAt || "")) {
        byId.set(item.id, item);
        bySubject.set(item.subject, item);
      }
    }
  }
  return {
    version: 1,
    items: [...byId.values()],
    updatedAt: nowIso(),
  };
}

export async function saveSharedFact(params: {
  personId: AvaPersonId;
  kind: AdminMemoryItem["kind"];
  subject: string;
  content: string;
  source?: AdminMemoryItem["source"];
}): Promise<AdminMemoryItem | null> {
  if (params.personId === "unknown") return null;
  const mem = await loadSharedPersistentMemory(params.personId);
  const now = nowIso();
  const existing = mem.items.find(
    (i) => i.subject === params.subject && i.status === "active"
  );
  const item: AdminMemoryItem = existing
    ? {
        ...existing,
        kind: params.kind,
        content: params.content,
        updatedAt: now,
        source: params.source || "user",
        importance: "high",
      }
    : {
        id: newId(),
        kind: params.kind,
        subject: params.subject,
        content: params.content,
        status: "active",
        importance: "high",
        source: params.source || "user",
        createdAt: now,
        updatedAt: now,
      };
  const next: AdminPersistentMemory = {
    version: 1,
    items: existing
      ? mem.items.map((i) => (i.id === item.id ? item : i))
      : [item, ...mem.items].slice(0, 80),
    updatedAt: now,
  };
  try {
    await setAvaMemory({
      scope: "OPERATIONAL",
      ownerUserId: sharedOwnerKey(params.personId),
      key: SHARED_FACTS_KEY,
      value: JSON.parse(JSON.stringify(next)) as object,
      source: "ava_shared_memory",
    });
  } catch (error) {
    console.warn("AVA_MEMORY_WRITE_ERROR AVA_MEMORY_ERROR scope=persistent");
    console.warn("AVA_MEMORY_WRITE_ERROR", error instanceof Error ? error.name : "unknown");
    return null;
  }
  return item;
}

export async function loadSharedSession(sessionId: string): Promise<AvaSharedSession> {
  const empty: AvaSharedSession = {
    version: 1,
    sessionId,
    turns: [],
    updatedAt: nowIso(),
  };
  try {
    const raw = await getAvaMemory({
      scope: "OPERATIONAL",
      ownerUserId: AVA_SYSTEM_ID,
      key: sessionKey(sessionId),
    });
    if (!raw || typeof raw !== "object") return empty;
    const o = raw as Partial<AvaSharedSession>;
    return {
      version: 1,
      sessionId,
      turns: Array.isArray(o.turns) ? o.turns.slice(-12) : [],
      lastProductQuery: o.lastProductQuery,
      nicotineInterview: o.nicotineInterview ?? null,
      updatedAt: o.updatedAt || nowIso(),
    };
  } catch (error) {
    console.warn("AVA_MEMORY_READ_ERROR AVA_MEMORY_ERROR scope=session");
    console.warn("AVA_MEMORY_READ_ERROR", error instanceof Error ? error.name : "unknown");
    return empty;
  }
}

export async function saveSharedSession(session: AvaSharedSession): Promise<void> {
  try {
    await setAvaMemory({
      scope: "OPERATIONAL",
      ownerUserId: AVA_SYSTEM_ID,
      key: sessionKey(session.sessionId),
      value: JSON.parse(
        JSON.stringify({
          ...session,
          updatedAt: nowIso(),
          turns: session.turns.slice(-12),
        }),
      ) as object,
      source: "ava_shared_session",
    });
  } catch (error) {
    console.warn("AVA_MEMORY_WRITE_ERROR AVA_MEMORY_ERROR scope=session");
    console.warn("AVA_MEMORY_WRITE_ERROR", error instanceof Error ? error.name : "unknown");
  }
}

/** « Mémorise / retiens … » — parsing local, sans dépendre du module admin-memory. */
export function extractMemorizeFact(
  msg: string,
): { subject: string; content: string } | null {
  if (
    !/\b(m[eé]morise|retiens?|retient|reten(?:ir|ons|ez|nent)?|souviens[- ]toi|note\s+(?:que|ceci|exactement)|enregistre)\b/i.test(
      msg,
    )
  ) {
    return null;
  }
  const recallOnly =
    /\?/.test(msg) ||
    /\b(rappelle[- ]moi|tu te souviens|quelle? est|qu['’]as[- ]tu)\b/i.test(msg);
  if (recallOnly && !/\bm[eé]morise\b/i.test(msg)) {
    return null;
  }

  const after = msg.match(
    /(?:m[eé]morise(?:\s+ceci)?(?:\s+exactement)?|retiens?|retient|reten(?:ir|ons|ez|nent)?|souviens[- ]toi|note\s+(?:que|ceci|exactement)|enregistre)\s*[:\-–]?\s*(.+)$/i,
  );
  const content = (after?.[1] || msg).trim().slice(0, 300);
  if (content.length < 6) return null;

  const subjectHint =
    content
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 40) || "fait_memorise";

  return { subject: subjectHint, content };
}

export function tryAnswerFromConfirmedMemory(
  message: string,
  persistent: AdminPersistentMemory,
): { text: string; subject: string } | null {
  const looksLikeRecall =
    /\b(quel(?:le)?\s+est|rappelle[- ]moi|tu\s+te\s+souviens|tu\s+(?:as\s+)?m[eé]moris|mot\s+de\s+test|qu['’]as[- ]tu\s+(?:retenu|not[eé])|ma pr[eé]f[eé]rence)\b/i.test(
      message,
    );
  if (!looksLikeRecall) return null;

  const active = persistent.items.filter(
    (i) =>
      i.status === "active" &&
      (i.kind === "confirmed_fact" ||
        i.kind === "user_preference" ||
        i.importance === "high"),
  );
  if (!active.length) return null;

  const tokens = message
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);

  const scored = active
    .map((item) => {
      const hay = `${item.subject} ${item.content}`.toLowerCase();
      const score = tokens.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0);
      return { item, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (active.length === 1) {
    return { text: `Oui — ${active[0].content}`, subject: active[0].subject };
  }
  if (!best || best.score < 1) return null;
  return { text: `Oui — ${best.item.content}`, subject: best.item.subject };
}
