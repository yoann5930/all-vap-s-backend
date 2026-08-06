/**
 * Score multi-indices de reconnaissance visuelle (DRAG / VOOPOO).
 * Ne confirme jamais sous 75 %. Un seul indice ne suffit pas.
 */
import { listDevices, findDeviceBySlug } from "@/lib/ava/device-support";
import { normalizeLoose } from "@/lib/ava/normalize-loose";

export const VISUAL_CONFIRM_THRESHOLD = 0.75;

export type VisualCue =
  | "logo_voopoo"
  | "inscription_drag"
  | "vertical_color_screen"
  | "top_wheel_control"
  | "box_chassis"
  | "everest_lab_logo"
  | "black_textured_panel"
  | "user_said_drag_6"
  | "check_atomizer_on_screen";

const CUE_WEIGHTS: Record<VisualCue, number> = {
  logo_voopoo: 0.18,
  inscription_drag: 0.16,
  vertical_color_screen: 0.12,
  top_wheel_control: 0.1,
  box_chassis: 0.1,
  everest_lab_logo: 0.12,
  black_textured_panel: 0.08,
  user_said_drag_6: 0.35,
  check_atomizer_on_screen: 0.08,
};

export type VisualRecognitionResult = {
  manufacturer: string | null;
  model: string | null;
  identifiedDevice: string | null;
  confidence: number;
  matchedCues: VisualCue[];
  candidates: Array<{ manufacturer: string; model: string; score: number }>;
  confirmed: boolean;
  needsMorePhotos: boolean;
  message: string;
};

/** Extrait des indices à partir d'une description / légende photo / message. */
export function extractVisualCuesFromText(text: string): VisualCue[] {
  const t = normalizeLoose(text);
  const cues: VisualCue[] = [];
  if (/voopoo|voo\s*poo/.test(t)) cues.push("logo_voopoo");
  if (/\bdrag\b/.test(t) && !/dragon|dragoon/.test(t)) cues.push("inscription_drag");
  if (/ecran|écran|screen|couleur|vertical/.test(t)) cues.push("vertical_color_screen");
  if (/molette|roulette|wheel|commande\s+superieur|bouton\s+haut/.test(t)) {
    cues.push("top_wheel_control");
  }
  if (/\bbox\b|chassis|châssis|mod\b/.test(t)) cues.push("box_chassis");
  if (/everest\s*lab|everest/.test(t)) cues.push("everest_lab_logo");
  if (/noir|texture|textur[eé]|panneau/.test(t)) cues.push("black_textured_panel");
  if (/drag\s*6|drag\s*vi/.test(t)) cues.push("user_said_drag_6");
  if (/check\s*atomizer/.test(t)) cues.push("check_atomizer_on_screen");
  return [...new Set(cues)];
}

export function scoreDrag6FromCues(cues: VisualCue[]): number {
  let score = 0;
  for (const c of cues) score += CUE_WEIGHTS[c] || 0;
  // Un seul indice insuffisant
  if (cues.length < 2 && !cues.includes("user_said_drag_6")) {
    score = Math.min(score, 0.4);
  }
  return Math.min(0.99, Math.round(score * 1000) / 1000);
}

export function recognizeDeviceFromVisualText(text: string): VisualRecognitionResult {
  const cues = extractVisualCuesFromText(text);
  const drag6Score = scoreDrag6FromCues(cues);

  const candidates: Array<{ manufacturer: string; model: string; score: number }> = [];
  if (cues.includes("logo_voopoo") || cues.includes("inscription_drag")) {
    candidates.push({ manufacturer: "VOOPOO", model: "DRAG 6", score: drag6Score });
    // Ne pas confondre avec d'autres DRAG sans confirmation
    if (!cues.includes("user_said_drag_6") && drag6Score < VISUAL_CONFIRM_THRESHOLD) {
      candidates.push({ manufacturer: "VOOPOO", model: "DRAG (famille — à préciser)", score: Math.max(0.2, drag6Score - 0.15) });
    }
  }

  const confirmed =
    cues.includes("user_said_drag_6") ||
    (drag6Score >= VISUAL_CONFIRM_THRESHOLD && cues.length >= 3);

  if (confirmed) {
    const device = findDeviceBySlug("voopoo-drag-6") || listDevices().find((d) => /drag\s*6/i.test(d.model));
    return {
      manufacturer: "VOOPOO",
      model: "DRAG 6",
      identifiedDevice: "VOOPOO_DRAG_6",
      confidence: Math.max(drag6Score, cues.includes("user_said_drag_6") ? 0.92 : drag6Score),
      matchedCues: cues,
      candidates: candidates.sort((a, b) => b.score - a.score),
      confirmed: true,
      needsMorePhotos: false,
      message: device
        ? "VOOPOO DRAG 6 identifiée (référentiel + indices)."
        : "VOOPOO DRAG 6 confirmée.",
    };
  }

  if (candidates.length === 0) {
    return {
      manufacturer: null,
      model: null,
      identifiedDevice: null,
      confidence: 0,
      matchedCues: cues,
      candidates: [],
      confirmed: false,
      needsMorePhotos: true,
      message:
        "Je ne peux pas confirmer le modèle avec confiance. Merci d'envoyer une photo du logo / du nom inscrit sur l'appareil.",
    };
  }

  return {
    manufacturer: "VOOPOO",
    model: null,
    identifiedDevice: null,
    confidence: drag6Score,
    matchedCues: cues,
    candidates: candidates.sort((a, b) => b.score - a.score),
    confirmed: false,
    needsMorePhotos: true,
    message:
      drag6Score < VISUAL_CONFIRM_THRESHOLD
        ? `Indices VOOPOO/DRAG détectés (confiance ${(drag6Score * 100).toFixed(0)} % < 75 %). Confirmez le modèle exact (ex. DRAG 6) ou ajoutez une photo du nom.`
        : "Plusieurs indices — confirmez s'il s'agit bien de la DRAG 6.",
  };
}
