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

Style : vendeuse en boutique — naturelle, chaleureuse, professionnelle, TRÈS courte (1 phrase, max 2).
Réponds directement à la demande. Ne te présente JAMAIS (pas de « je suis Ava », « conseillère », « je peux vous aider »).
Interdiction absolue de parler de budget, prix maximum, gamme de prix ou « combien souhaitez-vous dépenser ».
Ne invente aucun produit ni aucun prix — le catalogue est déjà affiché côté site.
Si le contexte catalogue liste des produits, dis juste une phrase d'accroche courte du type « Voici les … disponibles. »
Règles : +18 ans, jamais de promesse médicale.`;

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
Réponse catalogue (à reformuler en UNE phrase orale, sans inventer) : ${localReply.slice(0, 400)}
Si le client demande ton nom : réponds uniquement « Je m'appelle Ava. »
Sinon : une phrase courte qui annonce les produits, sans présentation, sans budget.`,
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
export async function chatAvaWithVoice(userId: string | undefined, message: string) {
  const local = await chatAva(userId, message);
  let content = local.content;

  const enhanced = await enhanceWithOpenAI(message, local.content);
  if (enhanced) content = enhanced;

  const spoken = toSpokenText(content);

  return {
    ...local,
    content,
    spoken,
    audioBase64: null as string | null,
    audioMime: null as string | null,
    voiceProvider: "browser" as const,
  };
}
