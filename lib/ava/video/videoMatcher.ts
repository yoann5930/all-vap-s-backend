/**
 * Recommandation vidéo selon contexte A.V.A.
 * Priorités : danger → diagnostic → matériel confirmé → code erreur → symptôme → débutant → général.
 */
import fs from "node:fs";
import path from "node:path";
import {
  getAllVideos,
  getVideoById,
  isVideoClientReady,
  type AvaVideo,
} from "./videoLibrary";
import {
  isExcludedVideoContext,
  sanitizeVideoForClient,
  videoBlockedByExclusion,
} from "./videoSafety";

export type VideoMatchContext = {
  message: string;
  deviceFamily?: string | null;
  deviceModel?: string | null;
  deviceConfirmed?: boolean;
  errorCode?: string | null;
  symptoms?: string[];
  diagnosticActive?: boolean;
  levelHint?: "debutant" | "intermediaire" | "avance" | null;
  allowDraftFallbackText?: boolean;
};

export type VideoRecommendation = {
  video: ReturnType<typeof sanitizeVideoForClient>;
  reason: string;
  priority: number;
  followUpQuestion: string;
  useFallbackTextOnly: boolean;
};

function loadJson<T>(rel: string, fallback: T): T {
  const p = path.join(process.cwd(), rel);
  if (!fs.existsSync(p)) return fallback;
  return JSON.parse(fs.readFileSync(p, "utf8")) as T;
}

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function detectErrorCode(message: string): string | null {
  const n = norm(message);
  if (n.includes("check atomizer") || n.includes("check-atomizer")) return "check-atomizer";
  if (n.includes("no atomizer") || n.includes("no-atomizer")) return "no-atomizer";
  return null;
}

function detectSymptoms(message: string): string[] {
  const n = norm(message);
  const out: string[] = [];
  if (/fuit|leak/.test(n)) out.push("fuite");
  if (/brul|burnt|dry hit|dryhit/.test(n)) out.push("gout-brule", "dry-hit");
  if (/charge pas|ne charge/.test(n)) out.push("ne-charge-pas");
  if (/verrouill/.test(n)) out.push("verrouille");
  if (/peu de vapeur|pas de vapeur/.test(n)) out.push("peu-vapeur");
  return out;
}

function detectIntent(message: string): string | null {
  const n = norm(message);
  if (/reconstructible|rebuild|rta\b|rda\b|rdta\b|coil\b|coton|mesh rebuild/.test(n)) {
    return "reconstructible";
  }
  if (/je debute|je débute|debutant|débutant|premiere fois|première fois/.test(n)) {
    return "debutant";
  }
  if (/entretien|nettoyer|nettoyage/.test(n)) return "entretien";
  if (/video|vidéo|tuto|tutoriel|montre.?moi|pedago/.test(n)) return "general";
  return null;
}

function wantsVideo(message: string): boolean {
  const n = norm(message);
  return (
    /video|vidéo|tuto|tutoriel|montre|comment (faire|remplir|changer|amorcer|monter)|apprendre|pedagog/.test(
      n,
    ) ||
    Boolean(detectErrorCode(message)) ||
    detectSymptoms(message).length > 0 ||
    detectIntent(message) === "reconstructible"
  );
}

export function matchVideosForContext(ctx: VideoMatchContext): VideoRecommendation[] {
  const excl = isExcludedVideoContext(ctx.message);
  if (excl.excluded) return [];

  if (!wantsVideo(ctx.message) && !ctx.diagnosticActive && !ctx.errorCode) {
    return [];
  }

  const diagMap = loadJson<{
    byErrorCode: Record<string, string[]>;
    bySymptom: Record<string, string[]>;
    byIntent: Record<string, string[]>;
  }>("data/ava/videos/video-diagnostic-mapping.json", {
    byErrorCode: {},
    bySymptom: {},
    byIntent: {},
  });
  const deviceMap = loadJson<{ mappings: { family: string; videoIds: string[] }[] }>(
    "data/ava/videos/video-device-mapping.json",
    { mappings: [] },
  );

  const scored = new Map<string, { video: AvaVideo; priority: number; reason: string }>();

  const add = (id: string, priority: number, reason: string) => {
    const v = getVideoById(id);
    if (!v) return;
    if (videoBlockedByExclusion(v, ctx.message)) return;
    // Vidéo modèle-spécifique seulement si confirmé
    if (v.models.length > 0 && !ctx.deviceConfirmed) return;
    if (v.models.length > 0 && ctx.deviceModel) {
      const ok = v.models.some((m) => norm(ctx.deviceModel!).includes(norm(m)));
      if (!ok) return;
    }
    const prev = scored.get(id);
    if (!prev || priority < prev.priority) {
      scored.set(id, { video: v, priority, reason });
    }
  };

  const error = ctx.errorCode || detectErrorCode(ctx.message);
  const symptoms = [...(ctx.symptoms || []), ...detectSymptoms(ctx.message)];
  const intent = detectIntent(ctx.message);

  // 1-2 diagnostic / erreur
  if (error && diagMap.byErrorCode[error]) {
    for (const id of diagMap.byErrorCode[error]) add(id, 2, `Code erreur : ${error}`);
  }
  // 3 matériel confirmé / famille
  if (ctx.deviceFamily) {
    const m = deviceMap.mappings.find((x) => x.family === norm(ctx.deviceFamily!));
    if (m) for (const id of m.videoIds) add(id, ctx.deviceConfirmed ? 3 : 5, `Famille ${ctx.deviceFamily}`);
  }
  // 5 symptômes
  for (const s of symptoms) {
    const ids = diagMap.bySymptom[s] || [];
    for (const id of ids) add(id, 5, `Symptôme : ${s}`);
  }
  // 6-7 intent
  if (intent && diagMap.byIntent[intent]) {
    for (const id of diagMap.byIntent[intent]) {
      add(id, intent === "reconstructible" ? 4 : 6, `Parcours ${intent}`);
    }
  }
  if (intent === "general" || /video|vidéo|tuto/.test(norm(ctx.message))) {
    // recherche large sur titres
    for (const v of getAllVideos()) {
      const blob = norm(`${v.title} ${v.description} ${v.symptoms.join(" ")}`);
      const tokens = norm(ctx.message).split(" ").filter((t) => t.length > 3);
      const hit = tokens.filter((t) => blob.includes(t)).length;
      if (hit >= 2) add(v.id, 7, "Recherche textuelle");
    }
  }

  const ordered = [...scored.values()].sort((a, b) => a.priority - b.priority).slice(0, 3);

  return ordered.map(({ video, priority, reason }) => {
    const ready = isVideoClientReady(video);
    const allowText = ctx.allowDraftFallbackText !== false;
    return {
      video: sanitizeVideoForClient(video),
      reason,
      priority,
      followUpQuestion:
        "Est-ce que ça a résolu votre souci, ou on continue le diagnostic ensemble ?",
      useFallbackTextOnly: !ready && allowText,
    };
  });
}

export function formatVideoReply(recs: VideoRecommendation[]): string | null {
  if (!recs.length) return null;
  const lines: string[] = [];
  for (const r of recs) {
    const v = r.video;
    if (r.useFallbackTextOnly) {
      lines.push(
        `📹 **${v.shortTitle || v.title}** _(média à fournir — aide texte)_`,
        v.safetyNotice,
        v.fallbackText,
        `Statut interne : ${v.status} / ${v.sourceStatus}`,
      );
    } else {
      lines.push(
        `📹 **${v.title}**`,
        v.safetyNotice,
        v.description,
        v.videoPath ? `Vidéo : ${v.videoPath}` : "",
      );
    }
    lines.push(`→ ${r.followUpQuestion}`);
    lines.push("");
  }
  return lines.filter(Boolean).join("\n");
}
