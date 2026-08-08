/**
 * A.V.A. Admin — conversation interne (pas mode vendeuse / client).
 * Réutilise les faits du moteur gestion + OpenAI si configuré.
 */

import { answerAvaGestion, type AvaGestionReply } from "@/lib/ava-gestion/advisor";
import type { DatePeriod } from "@/lib/timezone/shop-tz";

export type AdminChatTurn = { role: "user" | "assistant"; content: string };

export type AdminAvaConversationReply = {
  text: string;
  links: AvaGestionReply["links"];
  periodLabel: string;
  source: string;
  lastSyncAt: string | null;
  missingData: string[];
  conversational: boolean;
  grounded: boolean;
};

function envTrim(name: string, fallback = ""): string {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw.trim().replace(/^["']|["']$/g, "");
}

function getOpenAIKey(): string {
  return envTrim("OPENAI_API_KEY");
}

const ADMIN_SYSTEM = `Tu es A.V.A., assistante administrative interne All Vap's (Hautmont & Le Quesnoy).
Tu parles au propriétaire / administrateur, jamais à un client.

Rôle : administration, stocks, inventaires, boutiques, collaborateurs, diagnostics, rapports, pilotage VM Android / Fidelatoo, vérifications.
Style : conversationnelle, claire, professionnelle, naturelle en français. Tu peux poser une question de suivi si utile.
Tu te présentes brièvement seulement si on te demande qui tu es.

INTERDICTIONS STRICTES :
- jamais le mode vendeuse / conseil produit client ;
- ne jamais inventer de chiffre, stock, commande, EAN, droit ou statut ;
- si les FAITS fournis sont incomplets, dis-le et propose quoi vérifier ;
- ne t'attribue jamais de nouveaux droits admin ;
- pour actions sensibles (suppression massive, mots de passe, DNS, paiements, droits admin) : refuse d'exécuter et demande confirmation humaine ;
- ne mélange pas chat client / inventaire employé / catalogue public.

Si des FAITS MÉTIER sont fournis, appuie-toi uniquement dessus pour les données chiffrées.
Réponds de façon utile et conversationnelle (pas un dump brut de rapport sauf si on demande explicitement un rapport).`;

const GESTION_INTENT =
  /\b(r[eé]sum[eé]|rapport|commandes?|pr[eé]par|stock|stocks|faible|alerte|colis|anomalie|paiement|facture|ca\b|chiffre|panier|ventes?|compar(e|aison)|aujourd['’]?hui|hier|semaine|mois|quoi\s+faire|priorit[eé]|e-?mails?\s+en\s+erreur)\b/i;

const CHITCHAT_INTENT =
  /^(bonjour|bonsoir|salut|hey|hello|coucou|merci|ok|d['’]accord|super|parfait|ça\s+va|ca\s+va|comment\s+(vas|allez)|qui\s+(es|êtes)|tu\s+es\s+qui|pr[eé]sente[- ]toi|aide[- ]moi|help)\b/i;

const FOLLOWUP_SHORT =
  /^(et|donc|ensuite|pourquoi|comment|explique|d[eé]taille|plus|autre chose|et apr[eè]s)\b/i;

export function isGestionIntent(message: string): boolean {
  return GESTION_INTENT.test(message.trim());
}

export function isChitchatIntent(message: string): boolean {
  const m = message.trim();
  if (m.length <= 2) return true;
  return CHITCHAT_INTENT.test(m) || (m.length < 40 && FOLLOWUP_SHORT.test(m));
}

function localConversationalFallback(params: {
  message: string;
  history: AdminChatTurn[];
  grounded?: AvaGestionReply | null;
  opsText?: string;
}): string {
  const lower = params.message.toLowerCase().trim();

  if (/^(bonjour|bonsoir|salut|hey|hello|coucou)\b/.test(lower)) {
    return (
      "Bonjour — je suis A.V.A., ton assistante admin All Vap's. " +
      "On peut parler stocks, inventaires, commandes, diagnostics, VM Android ou rapports. " +
      "Que veux-tu regarder ?"
    );
  }

  if (/qui\s+(es|êtes)|tu\s+es\s+qui|pr[eé]sente/.test(lower)) {
    return (
      "Je suis A.V.A., assistante administrative interne All Vap's. " +
      "Ici je suis en mode admin uniquement — pas vendeuse client. " +
      "Je m'appuie sur les données réelles du back-office et sur ma VM / Fidelatoo quand c'est branché."
    );
  }

  if (/^merci\b/.test(lower)) {
    return "Avec plaisir. Dis-moi dès que tu as besoin d'un contrôle, d'un résumé ou d'une action.";
  }

  if (params.opsText) {
    return (
      "Voilà ce que j'ai obtenu côté autonome / VM :\n\n" +
      params.opsText +
      "\n\nTu veux que je creuse un point précis (statut, QR, identité, journal) ?"
    );
  }

  if (params.grounded?.text) {
    return (
      "Voici ce que j'ai trouvé dans les données admin :\n\n" +
      params.grounded.text +
      (params.grounded.missingData?.length
        ? `\n\nAttention, données partielles : ${params.grounded.missingData.join(" · ")}.`
        : "") +
      "\n\nTu veux que je détaille un bloc (commandes, stocks, livraisons…) ?"
    );
  }

  const lastAssistant = [...params.history].reverse().find((t) => t.role === "assistant");
  if (lastAssistant && FOLLOWUP_SHORT.test(lower)) {
    return (
      "Oui — précise ce que tu veux approfondir (ex. « stocks faibles », « commandes à préparer », « diagnostic écran ») " +
      "et je m'appuie sur les données réelles, sans inventer."
    );
  }

  return (
    "Je t'écoute. Dis-moi ce dont tu as besoin : résumé du jour, stocks, inventaire, " +
    "statut de ma VM, QR collaboratrice, ou une vérif admin. " +
    "Je reste en mode administratif — pas de conseils vendeuse."
  );
}

async function chatAdminWithOpenAI(params: {
  message: string;
  history: AdminChatTurn[];
  factsBlock?: string;
}): Promise<string | null> {
  const key = getOpenAIKey();
  if (!key) return null;

  const historyMessages = params.history.slice(-8).map((t) => ({
    role: t.role as "user" | "assistant",
    content: t.content.slice(0, 2500),
  }));

  const userContent = [
    params.factsBlock
      ? `FAITS MÉTIER (source All Vap's — ne pas inventer hors de ce bloc) :\n${params.factsBlock.slice(0, 3500)}`
      : "FAITS MÉTIER : aucun snapshot demandé pour ce tour.",
    "",
    `Message admin : ${params.message}`,
  ].join("\n");

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: envTrim("OPENAI_MODEL", "gpt-4o-mini") || "gpt-4o-mini",
        messages: [
          { role: "system", content: ADMIN_SYSTEM },
          ...historyMessages,
          { role: "user", content: userContent },
        ],
        max_tokens: 500,
        temperature: 0.55,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim();
    return text || null;
  } catch {
    return null;
  }
}

/**
 * Réponse conversationnelle Admin A.V.A.
 * - chitchat / suivi → dialogue
 * - intent gestion → faits answerAvaGestion + reformulation
 * - jamais persona vendeuse
 */
export async function answerAdminAvaConversation(params: {
  message: string;
  role: string;
  history?: AdminChatTurn[];
  periodKey?: DatePeriod;
  opsText?: string;
  /** Identité session serveur uniquement — jamais depuis le texte message */
  sessionIdentity?: {
    email: string;
    appRole: string;
    effectiveRole: string;
  };
}): Promise<AdminAvaConversationReply> {
  const history = params.history || [];
  const msg = params.message.trim();

  // Qui suis-je ? → réponse déterministe depuis la session (pas d'invention)
  if (
    params.sessionIdentity &&
    /\b(qui\s+(suis[- ]je|je\s+suis)|mon\s+(r[oô]le|compte|identit[eé]|email)|avec\s+qui\s+(parle|discut))/i.test(
      msg
    )
  ) {
    const id = params.sessionIdentity;
    return {
      text:
        `Tu es connecté en session Admin All Vap's avec le compte « ${id.email} ». ` +
        `Rôle applicatif : ${id.appRole} (rôle base : ${id.effectiveRole || params.role}). ` +
        `Je m'appuie uniquement sur cette session serveur — pas sur ce que tu écris dans le chat.`,
      links: [],
      periodLabel: "",
      source: "admin_ava_session_identity",
      lastSyncAt: null,
      missingData: [],
      conversational: true,
      grounded: true,
    };
  }

  const wantGestion = isGestionIntent(msg);

  let grounded: AvaGestionReply | null = null;
  if (wantGestion) {
    try {
      grounded = await answerAvaGestion({
        message: msg,
        role: params.role,
        periodKey: params.periodKey,
      });
    } catch (e) {
      // Ne jamais faire planter le chat admin pour une erreur snapshot
      grounded = {
        mode: "gestion",
        text:
          "Je n'ai pas pu charger le snapshot gestion pour le moment " +
          "(données temporairement indisponibles). On peut continuer à discuter, " +
          "ou réessayer le résumé dans un instant.",
        links: [],
        missingData: ["snapshot_gestion"],
        periodLabel: "",
        source: "admin_ava_gestion_error",
        lastSyncAt: null,
        generatedAt: new Date().toISOString(),
      };
      void e;
    }
  }

  const factsParts = [
    params.sessionIdentity
      ? `SESSION AUTHENTIFIÉE (source serveur, ne pas inventer) : email=${params.sessionIdentity.email} ; rôleApplicatif=${params.sessionIdentity.appRole} ; rôleBase=${params.sessionIdentity.effectiveRole}`
      : "",
    params.opsText ? `OPS / VM :\n${params.opsText}` : "",
    grounded?.text && grounded.source !== "admin_ava_gestion_error"
      ? `GESTION :\n${grounded.text}`
      : grounded?.source === "admin_ava_gestion_error"
        ? `GESTION : indisponible (${grounded.missingData.join(", ")})`
        : "",
  ].filter(Boolean);
  const factsBlock = factsParts.join("\n\n") || undefined;

  let openai: string | null = null;
  try {
    openai = await chatAdminWithOpenAI({
      message: msg,
      history,
      factsBlock,
    });
  } catch {
    openai = null;
  }

  // Si OpenAI a échoué (clé absente / HTTP) — fallback local, jamais throw
  const text =
    openai ||
    localConversationalFallback({
      message: msg,
      history,
      grounded,
      opsText: params.opsText,
    });

  return {
    text,
    links: grounded?.links || [],
    periodLabel: grounded?.periodLabel || "",
    source: openai
      ? grounded && grounded.source !== "admin_ava_gestion_error"
        ? "admin_ava_openai+gestion"
        : "admin_ava_openai"
      : grounded
        ? grounded.source === "admin_ava_gestion_error"
          ? "admin_ava_local+gestion_error"
          : "admin_ava_local+gestion"
        : "admin_ava_local",
    lastSyncAt: grounded?.lastSyncAt ?? null,
    missingData: grounded?.missingData || [],
    conversational: true,
    grounded: Boolean(
      (grounded && grounded.source !== "admin_ava_gestion_error") || params.opsText
    ),
  };
}
