import { chatAva } from "@/lib/ai/ava-advisor";

const OPENAI_KEY = process.env.OPENAI_API_KEY;

export function isOpenAIConfigured(): boolean {
  return Boolean(OPENAI_KEY);
}

const AVA_SYSTEM = `Tu es A.V.A. (All Vap's Virtual Advisor), conseillère vape chaleureuse et professionnelle chez All Vap's (Hautmont & Le Quesnoy).
Réponds en français, concis (2-3 phrases max), comme une vendeuse experte.
Tu conseilles : cigarettes électroniques, e-liquides, pods, résistances, accus, chargeurs, DIY, accessoires, promotions, horaires boutiques, fidélité, SAV.
Règles : vente +18 ans uniquement, jamais de promesse médicale, jamais conseiller aux mineurs.
Ne liste pas trop de produits — oriente vers la boutique ou propose 1-2 suggestions max.`;

export async function enhanceWithOpenAI(userMessage: string, localReply: string): Promise<string | null> {
  if (!OPENAI_KEY) return null;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        messages: [
          { role: "system", content: AVA_SYSTEM },
          {
            role: "user",
            content: `Question client : "${userMessage}"\nContexte catalogue (réponse locale) : ${localReply.slice(0, 600)}\nReformule naturellement pour une réponse vocale courte.`,
          },
        ],
        max_tokens: 180,
        temperature: 0.7,
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

export async function synthesizeOpenAIVoice(text: string): Promise<{ base64: string; mime: string } | null> {
  if (!OPENAI_KEY) return null;

  const clean = text.replace(/👋/g, "").trim().slice(0, 500);
  if (!clean) return null;

  try {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1-hd",
        voice: process.env.OPENAI_TTS_VOICE ?? "nova",
        input: clean,
        response_format: "mp3",
      }),
    });

    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    return { base64, mime: "audio/mpeg" };
  } catch {
    return null;
  }
}

export async function chatAvaWithVoice(userId: string | undefined, message: string) {
  const local = await chatAva(userId, message);
  let content = local.content;

  const enhanced = await enhanceWithOpenAI(message, local.content);
  if (enhanced) content = enhanced;

  const spoken = content;
  let audioBase64: string | null = null;
  let audioMime = "audio/mpeg";

  const audio = await synthesizeOpenAIVoice(spoken);
  if (audio) {
    audioBase64 = audio.base64;
    audioMime = audio.mime;
  }

  return {
    ...local,
    content,
    audioBase64,
    audioMime,
    voiceProvider: audioBase64 ? "openai" : "browser",
  };
}
