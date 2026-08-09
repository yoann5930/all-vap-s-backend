import type { AdminMemoryItem, AdminPersistentMemory, AdminSessionMemory } from "./types";
import { listActiveFacts } from "./store";

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreItem(item: AdminMemoryItem, query: string, topicHint: string | null): number {
  const q = norm(query);
  const subj = norm(item.subject);
  const content = norm(item.content);
  const project = norm(item.project || "");
  let score = 0;
  if (topicHint && (subj.includes(topicHint) || content.includes(topicHint) || project.includes(topicHint))) {
    score += 5;
  }
  for (const token of q.split(" ").filter((t) => t.length > 3)) {
    if (subj.includes(token)) score += 3;
    if (content.includes(token)) score += 2;
    if (project.includes(token)) score += 2;
  }
  if (item.importance === "high") score += 2;
  if (item.importance === "medium") score += 1;
  if (item.kind === "confirmed_fact") score += 1;
  if (item.kind === "user_preference") score += 1;
  if (item.taskStatus === "paused" || item.taskStatus === "in_progress") score += 2;
  if (item.status !== "active") score = -100;
  return score;
}

/**
 * Récupération sélective — n'injecte que les souvenirs utiles.
 */
export function retrieveRelevantAdminMemory(params: {
  persistent: AdminPersistentMemory;
  session: AdminSessionMemory | null;
  message: string;
  topicHint?: string | null;
  limit?: number;
}): {
  factsBlock: string;
  items: AdminMemoryItem[];
} {
  const active = listActiveFacts(params.persistent);
  const scored = active
    .map((item) => ({ item, score: scoreItem(item, params.message, params.topicHint || null) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, params.limit ?? 8)
    .map((x) => x.item);

  // Préférences + faits confirmés toujours injectés (même hors score lexical)
  const always = active
    .filter(
      (i) =>
        i.kind === "user_preference" ||
        i.kind === "confirmed_fact" ||
        i.kind === "pending_decision" ||
        i.importance === "high"
    )
    .slice(0, 5);
  for (const t of always) {
    if (!scored.find((s) => s.id === t.id)) scored.push(t);
  }

  // Toujours inclure tâches paused / in_progress (max 3) si absentes
  const tasks = active
    .filter((i) => i.taskStatus === "paused" || i.taskStatus === "in_progress")
    .slice(0, 3);
  for (const t of tasks) {
    if (!scored.find((s) => s.id === t.id)) scored.push(t);
  }

  const lines: string[] = [];
    if (params.session?.summary) {
    lines.push(`MÉMOIRE SESSION : ${params.session.summary.slice(0, 600)}`);
    if (params.session.lastTopic) lines.push(`Dernier sujet : ${params.session.lastTopic}`);
    if (params.session.activeThread?.subject) {
      lines.push(
        `FIL ACTIF (${params.session.activeThread.status}) : ${params.session.activeThread.subject} — ${params.session.activeThread.summary.slice(0, 200)}`
      );
    }
    if (params.session.recentActions?.length) {
      lines.push(`Actions récentes : ${params.session.recentActions.slice(0, 4).join(" · ")}`);
    }
  }

  if (scored.length) {
    lines.push("FAITS MÉMORISÉS PERTINENTS (ne pas inventer hors de cette liste) :");
    for (const it of scored.slice(0, 8)) {
      lines.push(
        `- [${it.kind}${it.taskStatus ? `/${it.taskStatus}` : ""}] ${it.subject}: ${it.content}`
      );
    }
  }

  return { factsBlock: lines.join("\n"), items: scored };
}

/** Compacte l'historique pour le LLM (évite de réinjecter des dumps rapports). */
export function compactHistoryForLlm(
  history: { role: "user" | "assistant"; content: string }[],
  preferShort: boolean
): { role: "user" | "assistant"; content: string }[] {
  const take = preferShort ? 12 : 20;
  return history.slice(-take).map((t) => {
    if (t.role === "user") {
      return { role: t.role, content: t.content.slice(0, 800) };
    }
    // Assistant : garder l'essentiel, pas un dump de 3k
    const max = preferShort ? 450 : 900;
    let c = t.content;
    if (c.length > max) {
      c = c.slice(0, max) + "…";
    }
    return { role: t.role, content: c };
  });
}
