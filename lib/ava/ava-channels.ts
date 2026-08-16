/**
 * AVA = une seule identité / un seul cerveau.
 * Deux canaux d'accès — jamais le client ne s'auto-proclame admin.
 *
 * ADMIN / SAMSUNG → interne (chiffres, ventes, stats, inventaire, outils admin)
 * VENDEUSE / CLIENT → public (catalogue, dispo, boutiques, horaires, conseils)
 */
import { timingSafeEqual } from "node:crypto";
import type { AvaChannel } from "@/lib/ava/ava-core";

export type AvaAuthSnapshot = {
  authenticated: boolean;
  role: string | null;
};

export type AvaAudience = "internal" | "public";
export type AvaSurface = "admin_web" | "samsung" | "vendeuse";

export type AvaAccess = {
  channel: AvaChannel;
  audience: AvaAudience;
  surface: AvaSurface;
};

export const AVA_PUBLIC_CONFIDENTIAL_DENIAL =
  "Ces infos sont internes à l'équipe. En boutique je peux t'aider sur le catalogue, les disponibilités, les horaires et les conseils.";

export function isInternalAudience(audience: AvaAudience): boolean {
  return audience === "internal";
}

export function isInternalChannel(channel: AvaChannel): boolean {
  return channel === "ADMIN_WEB";
}

function envToken(): string {
  return (process.env.AVA_SAMSUNG_DEVICE_TOKEN || "").trim();
}

export function isTrustedSamsungDevice(
  header: string | null | undefined,
  expected = envToken(),
): boolean {
  const got = (header || "").trim();
  if (!expected || !got) return false;
  const left = Buffer.from(got);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Auth serveur uniquement.
 * employeeId / clientSource / « je suis admin » dans le texte : aucun droit.
 */
export function resolveAvaAccess(params: {
  auth: AvaAuthSnapshot | null | undefined;
  deviceTokenHeader?: string | null;
  samsungTokenExpected?: string;
}): AvaAccess {
  const role = (params.auth?.role || "").toUpperCase();
  if (params.auth?.authenticated && role === "ADMIN") {
    return { channel: "ADMIN_WEB", audience: "internal", surface: "admin_web" };
  }
  if (isTrustedSamsungDevice(params.deviceTokenHeader, params.samsungTokenExpected ?? envToken())) {
    return { channel: "ADMIN_WEB", audience: "internal", surface: "samsung" };
  }
  return { channel: "ANDROID", audience: "public", surface: "vendeuse" };
}

function normAsk(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/['’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Catalogue / dispo publique — pas un rapport interne. */
export function isPublicCatalogAsk(raw: string): boolean {
  const n = normAsk(raw);
  const seeking =
    /cherche|trouve|tu as|t as|vous avez|avez vous|il me faut|je veux|s il te plait|catalogue|disponible|en rayon|il reste|rupture|recherche ce produit sur/.test(
      n,
    );
  const catalogItem =
    /eliquide|e-liquide|e liquide|puff|pod|vape|liquide |fraise|fruits? rouges?|fruite|fruité|cassis|framboise|menthe/.test(
      n,
    );
  return seeking && catalogItem;
}

/**
 * Chiffres, ventes, stats, inventaire, commandes internes, fiches clients.
 * Pas « vous avez de la menthe en stock ».
 */
export function isConfidentialAsk(raw: string): boolean {
  if (isPublicCatalogAsk(raw)) return false;
  const n = normAsk(raw);
  return (
    /chiffre d affaires|chiffre daffaires|panier moyen/.test(n) ||
    /ca du jour|ca d aujourd|ca aujourd|notre ca|le ca |mon ca /.test(n) ||
    /ventes du jour|ventes d aujourd|les ventes|voir les ventes|regarde les ventes/.test(n) ||
    /statistique|stats boutique|rapport (de )?stock|stocks faibles|etat de l inventaire|\binventaire\b/.test(
      n,
    ) ||
    /fiches? clients?|compte client|commandes du jour|commandes en ligne|facture/.test(n) ||
    /combien (de |vous avez )?vendu|combien vous faites de chiffre|combien vous faites du chiffre/.test(n) ||
    /combien de commandes|nombre de commandes|commandes (vous avez )?aujourd/.test(n) ||
    /marge brute|outils admin|rapport complet|point du jour/.test(n)
  );
}

export function scrubPublicReply(text: string): string {
  return text
    .replace(/FIDELATOO_ORCHESTRATOR_SECRET|OPENAI_API_KEY|JWT_SECRET|AVA_SAMSUNG_DEVICE_TOKEN/gi, "[redacted]")
    .replace(/sk-[a-zA-Z0-9_-]+/g, "[redacted]");
}

export function avaAudiencePrompt(access: AvaAccess): string {
  if (access.audience === "internal" && access.surface === "samsung") {
    return [
      "CANAL : ADMIN / SAMSUNG (interne). Tu restes AVA, la même personne.",
      "Accès autorisé : chiffres, ventes, stats, inventaire, outils admin — lecture seule.",
      "Jamais d'écriture stock / catalogue. Jamais exposer ces données à un client boutique.",
      "À l'oral : phrases claires, pas un tableau de 40 lignes.",
    ].join(" ");
  }
  if (access.audience === "internal") {
    return [
      "CANAL : ADMIN (site). Tu restes AVA, la même personne.",
      "Accès autorisé : chiffres, ventes, stats, inventaire, outils admin — lecture seule.",
      "Jamais d'écriture stock / catalogue. Jamais de fuite vers un client boutique.",
    ].join(" ");
  }
  return [
    "CANAL : VENDEUSE / CLIENT (public).",
    "Autorisé : catalogue, disponibilité publique, boutiques, horaires, conseils, infos commerciales publiques.",
    "Interdit : chiffres d'affaires, ventes détaillées, stats internes, inventaire interne, fiches clients, commandes, outils admin.",
    "Si on te demande une donnée confidentielle : refuse simplement, oriente vers un membre de l'équipe. N'invente aucun chiffre.",
    "Téléphone Android : réponses orales, courtes. Les commandes locales (veille, micro, avatar) restent sur le téléphone.",
  ].join(" ");
}
