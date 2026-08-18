/**
 * Guide matériel AVA — uniquement données vérifiées.
 * Ne jamais inventer une séquence de boutons.
 */
import { findDeviceBySlug, searchDevices } from "@/lib/ava/device-support";
import { normAdvisor, type AvaExperienceLevel } from "@/lib/ava/advisor-policy";
import type { VapeDeviceManual, VerificationStatus } from "@/lib/ava/device-types";

const PUBLISHABLE: VerificationStatus[] = ["OFFICIAL_CONFIRMED", "OFFICIAL_PARTIAL"];

export type AvaDeviceGuideView = {
  available: boolean;
  model: string | null;
  status: VerificationStatus | "UNVERIFIED";
  spoken: string;
  sections: Array<{ id: string; title: string; lines: string[] }>;
};

export function isDeviceGuideIntent(message: string): boolean {
  const t = normAdvisor(message);
  return /tutoriel|notice|mode d emploi|comment (remplir|recharger|charger|allumer|eteindre|regler|changer)|remplissage|changer (la )?(resistance|cartouche|pod)|allumer mon|eteindre mon|regler mon/.test(t);
}

function isPublishable(d: VapeDeviceManual): boolean {
  return PUBLISHABLE.includes(d.verificationStatus);
}

function linesFrom(parts: Array<string | undefined | null>): string[] {
  return parts.map((p) => (p || "").trim()).filter(Boolean);
}

export function presentDeviceGuide(
  query: string,
  level: AvaExperienceLevel,
): AvaDeviceGuideView {
  const q = (query || "").trim();
  if (!q) {
    return {
      available: false,
      model: null,
      status: "UNVERIFIED",
      spoken:
        "Je n'ai pas encore le modèle exact. Indiquez la marque et le nom, je vérifierai la notice — je n'invente pas les commandes.",
      sections: [],
    };
  }

  const found = findDeviceBySlug(q) || searchDevices(q, 1)[0] || null;
  if (!found || !isPublishable(found)) {
    return {
      available: false,
      model: found ? `${found.manufacturer} ${found.model}` : null,
      status: found?.verificationStatus || "UNVERIFIED",
      spoken:
        "Je n'ai pas de notice suffisamment vérifiée pour ce modèle. Je ne vais pas inventer les boutons ni le remplissage. Je peux vous orienter vers l'équipe All Vap's pour le vérifier avec la notice constructeur.",
      sections: [],
    };
  }

  const controls = found.controls || {};
  const specs = found.technicalSpecs || {};
  const fill = found.fillingProcedure || [];
  const coil = found.coilReplacementProcedure || found.podReplacementProcedure || [];
  const concise = level === "EXPERT" || level === "AUTONOMOUS";
  const sections: AvaDeviceGuideView["sections"] = [];

  sections.push({
    id: "overview",
    title: "Prise en main",
    lines: linesFrom([
      `${found.manufacturer} ${found.model}`,
      concise ? undefined : "Je vous donne uniquement les étapes confirmées pour ce modèle.",
    ]),
  });

  const power = linesFrom([controls.powerOn, controls.powerOff, controls.lockUnlock]);
  if (power.length) sections.push({ id: "power", title: "Allumer / éteindre", lines: power });
  if (fill.length) sections.push({ id: "fill", title: "Remplissage", lines: fill.slice(0, concise ? 4 : 8) });
  if (coil.length) {
    sections.push({
      id: "coil",
      title: found.podReplacementProcedure?.length ? "Pod / cartouche" : "Résistance",
      lines: coil.slice(0, concise ? 4 : 8),
    });
  }

  const charge = linesFrom([specs.chargingPort, specs.chargingPower]);
  if (charge.length) sections.push({ id: "charging", title: "Recharge", lines: charge });

  const menu = linesFrom([controls.menuAccess, controls.wattageAdjustment, controls.changeMode]);
  if (menu.length) sections.push({ id: "menu", title: "Réglages", lines: menu });

  const spoken = concise
    ? `Voici l'essentiel vérifié pour le ${found.manufacturer} ${found.model}.`
    : `Je vous accompagne sur le ${found.manufacturer} ${found.model}, étape par étape, uniquement avec ce qui est confirmé pour ce modèle.`;

  return {
    available: true,
    model: `${found.manufacturer} ${found.model}`,
    status: found.verificationStatus,
    spoken,
    sections,
  };
}

export function speakDeviceGuide(guide: AvaDeviceGuideView): string {
  if (!guide.available) return guide.spoken;
  const steps = guide.sections
    .filter((section) => section.id !== "overview")
    .flatMap((section) => section.lines.map((line) => `${section.title} : ${line}`))
    .slice(0, 8);
  return [guide.spoken, ...steps].join(" ").slice(0, 1400);
}
