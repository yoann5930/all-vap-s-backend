import { chatAva } from "@/lib/ai/ava-advisor";
import { AVA_GREETING_SHORT, toSpokenText } from "@/lib/ai/ava-speech-utils";

function envTrim(name: string, fallback = ""): string {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw.trim().replace(/^["']|["']$/g, "");
}

function getOpenAIKey(): string {
  return envTrim("OPENAI_API_KEY");
}

export function isOpenAIConfigured(): boolean {
  return Boolean(getOpenAIKey());
}

const AVA_SYSTEM = `Tu es Ava, conseillère de vente All Vap's (Hautmont & Le Quesnoy).
Prononce ton nom « Ava » (prénom), jamais « A-V-A » lettre à lettre.
DIY se dit « Di-Yaï », jamais D-I-Y.
e.Tasty se dit toujours « i Tasty » — jamais « E Tasty », « e point Tasty » ni « E-Tasty ».

Tu disposes d'une mémoire métier vape (histoire ~15 ans, PG/VG, nicotine/sels, MTL/DL, sécurité accus, TPD, entretien).
Si la réponse locale contient déjà ces faits, reformule-les sans inventer ni contredire.
Style : vendeuse en boutique — naturelle, chaleureuse, professionnelle. Tu accompagnes, tu ne lis jamais l'écran.
Réponds directement à la demande. Ne te présente JAMAIS (pas de « je suis Ava », « conseillère », « je peux vous aider »).

INTERDICTIONS VOCALES ABSOLUES :
- jamais de prix (€, euros, « ce produit coûte », « le prix est ») — dis plutôt que le tarif est affiché à l'écran ;
- jamais de stock (« 2 en stock », « 1 restant ») ;
- jamais de volume (ml), fabricant ou gamme ;
- jamais de lecture complète de fiche produit.
- jamais de promesse médicale ou de sevrage.

Si des produits sont trouvés : annonce brièvement, cite uniquement les noms commerciaux (ex. Bako, Freho, Numbers 7), puis renvoie vers l'écran (« juste en dessous »).
Un seul produit : « J'ai trouvé le produit… Je vous affiche sa fiche juste en dessous. »
Ne invente aucun produit. Règles : +18 ans, jamais de promesse médicale.`;

/**
 * Reformule la réponse texte via OpenAI Chat (gratuit côté TTS : aucune API audio).
 * La lecture vocale est exclusivement gérée par speechSynthesis côté navigateur.
 */
export async function enhanceWithOpenAI(userMessage: string, localReply: string): Promise<string | null> {
  const OPENAI_KEY = getOpenAIKey();
  if (!OPENAI_KEY) return null;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: envTrim("OPENAI_MODEL", "gpt-4o-mini") || "gpt-4o-mini",
        messages: [
          { role: "system", content: AVA_SYSTEM },
          {
            role: "user",
            content: `Question client : "${userMessage}"
Réponse catalogue (à reformuler oralement, sans inventer) : ${localReply.slice(0, 400)}
Si le client demande ton nom : réponds uniquement « Je m'appelle Ava. »
Sinon : phrase naturelle de conseillère — noms commerciaux seulement, sans prix / stock / ml / fabricant / gamme, renvoi vers l'écran.`,
          },
        ],
        max_tokens: 80,
        temperature: 0.6,
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

/** Accueil texte uniquement — voix = navigateur (aucun appel OpenAI TTS). */
export async function synthesizeGreetingVoice() {
  const spoken = AVA_GREETING_SHORT;
  return {
    content: spoken,
    spoken,
    audioBase64: null as string | null,
    audioMime: null as string | null,
    voiceProvider: "browser" as const,
  };
}

/**
 * Chat Ava : texte (local + optionnel OpenAI Chat).
 * Jamais d’appel à /v1/audio/speech ni gpt-*-tts.
 */
export async function chatAvaWithVoice(
  userId: string | undefined,
  message: string,
  options?: import("@/lib/ai/ava-advisor").AvaChatOptions
) {
  const local = await chatAva(userId, message, options);
  let content = local.content;

  // Ne pas écraser les questions de précision ni les réponses produits détaillées
  const skipEnhance =
    local.products.length > 0 ||
    /\?$/.test(local.content.trim()) ||
    local.content.length > 280;

  if (!skipEnhance) {
    const enhanced = await enhanceWithOpenAI(message, local.content);
    if (enhanced) content = enhanced;
  }

  // Réponses produits : laisser assez de place pour l'intro + noms + renvoi écran
  const spoken = toSpokenText(content, local.products.length > 0 ? 420 : 220);

  return {
    ...local,
    content,
    spoken,
    audioBase64: null as string | null,
    audioMime: null as string | null,
    voiceProvider: "browser" as const,
  };
}
