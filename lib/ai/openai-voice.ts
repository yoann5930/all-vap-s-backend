import { chatAva } from "@/lib/ai/ava-advisor";
import { AVA_GREETING_SHORT, humanizeForSpeech, toSpokenText } from "@/lib/ai/ava-speech-utils";

const OPENAI_KEY = process.env.OPENAI_API_KEY;

export function isOpenAIConfigured(): boolean {
  return Boolean(OPENAI_KEY);
}

const AVA_SYSTEM = `Tu es AVA (conseillère virtuelle All Vap's), chaleureuse, chez All Vap's (Hautmont & Le Quesnoy).
Tu t'appelles AVA — jamais « A.V.A. ». Tu parles comme une vraie vendeuse experte en boutique : naturelle, fluide, jamais robotique.
Réponds en français oral, 1 à 3 phrases max, avec des tournures conversationnelles.
Évite les listes, le jargon administratif, et les phrases trop parfaites ou monocordes.
Tu conseilles : cigarettes électroniques, e-liquides, pods, résistances, accus, chargeurs, DIY, accessoires, promotions, horaires, fidélité, SAV.
Règles : +18 ans uniquement, jamais de promesse médicale, jamais conseiller aux mineurs.
Propose au plus 1-2 pistes, sans catalogue.`;

const TTS_INSTRUCTIONS = `Speak in natural French from France, like a warm woman in her late twenties advising in a premium boutique.
Be conversational, fluid and human — never robotic, never like a GPS or IVR phone menu.
Slight smile in the voice, calm confidence, soft energy.
Use natural pacing with short pauses between sentences.
Clear diction, no exaggeration, no monotone.`;

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
            content: `Question client : "${userMessage}"
Contexte catalogue : ${localReply.slice(0, 600)}
Reformule pour une réponse vocale 100% naturelle, comme si tu parlais face au client. Pas de puces, pas d'émojis.`,
          },
        ],
        max_tokens: 180,
        temperature: 0.85,
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

async function requestSpeech(
  payload: Record<string, unknown>
): Promise<{ base64: string; mime: string } | null> {
  if (!OPENAI_KEY) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    return { base64: Buffer.from(buffer).toString("base64"), mime: "audio/mpeg" };
  } catch {
    return null;
  }
}

export async function synthesizeOpenAIVoice(text: string): Promise<{ base64: string; mime: string } | null> {
  const clean = humanizeForSpeech(text).slice(0, 900);
  if (!clean) return null;

  const voice = process.env.OPENAI_TTS_VOICE ?? "coral";
  const preferredModel = process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts";

  // Modèle expressif (voix plus humaine + instructions de ton)
  const modern = await requestSpeech({
    model: preferredModel,
    voice,
    input: clean,
    instructions: TTS_INSTRUCTIONS,
    response_format: "mp3",
  });
  if (modern) return modern;

  // Fallback HD classique
  return requestSpeech({
    model: "tts-1-hd",
    voice: process.env.OPENAI_TTS_VOICE_FALLBACK ?? "nova",
    input: clean,
    speed: 0.98,
    response_format: "mp3",
  });
}

export async function synthesizeGreetingVoice() {
  const spoken = AVA_GREETING_SHORT;
  const audio = await synthesizeOpenAIVoice(spoken);
  return {
    content: spoken,
    spoken,
    audioBase64: audio?.base64 ?? null,
    audioMime: audio?.mime ?? "audio/mpeg",
    voiceProvider: audio ? "openai" : "browser",
  };
}

export async function chatAvaWithVoice(userId: string | undefined, message: string) {
  const local = await chatAva(userId, message);
  let content = local.content;

  const enhanced = await enhanceWithOpenAI(message, local.content);
  if (enhanced) content = enhanced;

  const spoken = toSpokenText(content);
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
    spoken,
    audioBase64,
    audioMime,
    voiceProvider: audioBase64 ? "openai" : "browser",
  };
}
