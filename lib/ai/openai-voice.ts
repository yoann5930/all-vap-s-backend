import { chatAva } from "@/lib/ai/ava-advisor";
import { AVA_GREETING_SHORT, humanizeForSpeech, toSpokenText } from "@/lib/ai/ava-speech-utils";

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

const AVA_SYSTEM = `Tu es Ava (conseillère virtuelle All Vap's), chaleureuse, chez All Vap's (Hautmont & Le Quesnoy).
Tu t'appelles Ava — jamais « A.V.A. ». Tu parles comme une vraie vendeuse experte en boutique : douce, posée, naturelle, jamais robotique.
Réponds en français oral de France (neutre), 1 à 3 phrases max, tournures conversationnelles et calmes.
Évite les listes, le jargon administratif, et les phrases trop parfaites ou monocordes.
Tu conseilles : cigarettes électroniques, e-liquides, pods, résistances, accus, chargeurs, DIY, accessoires, promotions, horaires, fidélité, SAV.
Règles : +18 ans uniquement, jamais de promesse médicale, jamais conseiller aux mineurs.
Propose au plus 1-2 pistes, sans catalogue.`;

const TTS_INSTRUCTIONS = `Parle exclusivement en français de France, accent neutre standard (Île-de-France), sans aucun accent étranger, américain, québécois, belge ou régional marqué.
Voix de femme douce, calme, chaleureuse et posée — jamais agressive, jamais robotique, jamais théâtrale.
Débit un peu lent et fluide, volume doux, intonation naturelle et légère.
Prononciation claire et soignée. Pas d'emphase exagérée, pas de ton commercial forcé.
Tu es Ava, conseillère boutique premium : bienveillante et discrète.`;

const ALLOWED_TTS_VOICES = new Set([
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "onyx",
  "nova",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
]);

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
  const OPENAI_KEY = getOpenAIKey();
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
    if (!res.ok) {
      console.warn(
        `[All Vap's][TTS] OpenAI speech HTTP ${res.status} model=${String(payload.model)} voice=${String(payload.voice)}`
      );
      return null;
    }
    const buffer = await res.arrayBuffer();
    if (!buffer.byteLength) return null;
    return { base64: Buffer.from(buffer).toString("base64"), mime: "audio/mpeg" };
  } catch (err) {
    console.warn(
      "[All Vap's][TTS] OpenAI speech network error",
      err instanceof Error ? err.message : "unknown"
    );
    return null;
  }
}

function resolveTtsVoice(raw: string, fallback: string): string {
  const v = raw.toLowerCase();
  if (ALLOWED_TTS_VOICES.has(v)) return v;
  const safe = raw.length > 24 ? `${raw.slice(0, 4)}…(len=${raw.length})` : raw;
  console.warn(`[All Vap's][TTS] voice invalide "${safe}" — fallback ${fallback}`);
  return fallback;
}

function resolveTtsModel(raw: string, fallback: string): string {
  const m = raw.trim();
  // Corrige la typo fréquente gpt-40-mini-tts → gpt-4o-mini-tts
  const fixed = m.replace(/gpt-40-mini-tts/gi, "gpt-4o-mini-tts");
  if (!fixed) return fallback;
  if (fixed !== m) {
    console.warn("[All Vap's][TTS] modèle corrigé gpt-40-mini-tts → gpt-4o-mini-tts");
  }
  return fixed;
}

export async function synthesizeOpenAIVoice(text: string): Promise<{ base64: string; mime: string } | null> {
  const clean = humanizeForSpeech(text).slice(0, 900);
  if (!clean) return null;

  const preferredModel = resolveTtsModel(
    envTrim("OPENAI_TTS_MODEL", "gpt-4o-mini-tts") || "gpt-4o-mini-tts",
    "gpt-4o-mini-tts"
  );
  const voice = resolveTtsVoice(envTrim("OPENAI_TTS_VOICE", "shimmer") || "shimmer", "shimmer");
  const fallbackVoice = resolveTtsVoice(
    envTrim("OPENAI_TTS_VOICE_FALLBACK", "nova") || "nova",
    "nova"
  );

  // 1) Modèle expressif + instructions
  const modern = await requestSpeech({
    model: preferredModel,
    voice,
    input: clean,
    instructions: TTS_INSTRUCTIONS,
    response_format: "mp3",
  });
  if (modern) return modern;

  // 2) Même modèle sans instructions
  const modernPlain = await requestSpeech({
    model: preferredModel,
    voice,
    input: clean,
    response_format: "mp3",
  });
  if (modernPlain) return modernPlain;

  // 3) Fallback HD classique
  return requestSpeech({
    model: "tts-1-hd",
    voice: fallbackVoice,
    input: clean,
    speed: 0.92,
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
