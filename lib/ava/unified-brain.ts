/**
 * Cerveau AVA unique (ava-main) — Android et Admin s'y branchent.
 * Catalogue / stock : lecture seule. Internet : serveur uniquement.
 */
import { getAvaCatalogService } from "@/lib/ai/ava";
import { toAvaProductCard } from "@/lib/ai/ava/response-builder";
import { chatWithAvaLlm } from "@/lib/ava/production-llm";
import { stores } from "@/lib/stores";
import { getShopClock, shopClockSystemLine, speakShopClock, speakShopOpenClosed } from "@/lib/ava/shop-clock";
import { searchWebForAva, speakWebHits } from "@/lib/ava/android-web-search";
import {
  AVA_IDENTITY_SPOKEN,
  AVA_SYSTEM_ID,
  avaSystemPrompt,
  isAvaSelfIntro,
  type AvaChannel,
} from "@/lib/ava/ava-core";
import {
  extractMemorizeFact,
  loadSharedPersistentMemory,
  loadSharedSession,
  personIdFromEmployee,
  saveSharedFact,
  saveSharedSession,
  tryAnswerFromConfirmedMemory,
  type AvaPersonId,
} from "@/lib/ava/shared-memory";

export type AvaBrainReply = {
  response: string;
  source: string;
  avaSystemId: string;
  channel: AvaChannel;
  personId: AvaPersonId;
  tool: string | null;
  memoryUsed: boolean;
  proposedAction: { type: string };
};

export function classifyAvaNeed(raw: string): "PRODUCT" | "WEB" | "BUSINESS" | "MEMORY" | "GENERAL" | "CLOCK" {
  const n = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/['’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (
    /\b(memorise|retiens?|retient|retenir|retenons|souviens[- ]toi|tu te souviens|rappelle[- ]moi)\b/.test(n)
  ) {
    return "MEMORY";
  }
  if (
    /recherche sur internet|cherche sur internet|meteo|météo|quel temps|actualit|dernier modele|dernier modèle/.test(
      n,
    )
  ) {
    return "WEB";
  }
  const clockAsk =
    /quel jour|quelle date|quelle heure|l heure qu|on est quel|c est quel jour|on est le combien|c est le combien|c est (un )?jour ferie|c est ferie|aujourd hui (on est|c est quel)/.test(
      n,
    );
  const openClosedAsk = /ouvert|ferme|horaire|adresse|boutique/.test(n);
  if (clockAsk && !openClosedAsk) {
    return "CLOCK";
  }
  const definition = /c est quoi|explique|pourquoi /.test(n);
  const shopPlace =
    /horaire|adresse|boutique|hautmont|quesnoy|all\s*vap|ouvert|ferme|ou vous etes|vous etes ou|ou etes vous/.test(
      n,
    );
  const shopAsk =
    /ou |adresse|horaire|ouvert|ferme|trouver|vous etes|c est ouvert|ou vous/.test(n);
  if (!definition && shopPlace && shopAsk) {
    return "BUSINESS";
  }
  const seeking =
    /cherche|trouve|tu as|t as|vous avez|avez vous|il me faut|je veux|s il te plait|catalogue|stock|disponible|en rayon|il reste|rupture/.test(
      n,
    );
  const catalogItem =
    /eliquide|e-liquide|e liquide|puff|pod|vape|stock|disponible|catalogue|liquide |fraise|fruits? rouges?|fruite|fruité|cassis|framboise|menthe/.test(
      n,
    );
  if (!definition && seeking && catalogItem) {
    return "PRODUCT";
  }
  if (
    !definition &&
    catalogItem &&
    (/^un |^une |^des |^du |s il te plait/.test(n) || /tu as quoi en |trouve[- ]moi |cherche[- ]moi /.test(n))
  ) {
    return "PRODUCT";
  }
  return "GENERAL";
}

function expandQuery(message: string): string {
  if (/fruits? rouges?/i.test(message)) {
    return `${message} fraise framboise cassis mure groseille cerise`;
  }
  return message;
}

function speakProducts(
  results: Array<{ name: string; availabilityStatus: string }>,
): string {
  if (!results.length) {
    return "Je ne trouve pas de produit correspondant actuellement.";
  }
  const available = results.filter((r) => r.availabilityStatus !== "rupture");
  const list = (available.length ? available : results).slice(0, 3);
  const more =
    results.length > 3
      ? ` J'en ai trouvé ${results.length}. Je peux te donner les trois premiers ou affiner.`
      : "";
  if (list.length === 1) {
    const status =
      list[0].availabilityStatus === "disponible"
        ? "disponible"
        : list[0].availabilityStatus === "stock_faible"
          ? "encore un peu en rayon"
          : "en rupture";
    return `J'ai trouvé ${list[0].name}, ${status}.${more}`;
  }
  const names = list.map((r) => r.name).join(", ");
  return `Oui, j'en ai trouvé plusieurs. Par exemple : ${names}.${more}`;
}

function reply(
  channel: AvaChannel,
  personId: AvaPersonId,
  response: string,
  source: string,
  tool: string | null,
  memoryUsed: boolean,
): AvaBrainReply {
  console.info(
    `AVA I [brain] id=${AVA_SYSTEM_ID} channel=${channel} person=${personId} source=${source} tool=${tool || "none"} memory=${memoryUsed ? "yes" : "no"}`,
  );
  console.info(source);
  return {
    response,
    source,
    avaSystemId: AVA_SYSTEM_ID,
    channel,
    personId,
    tool,
    memoryUsed,
    proposedAction: { type: "none" },
  };
}

export async function runAvaBrain(params: {
  channel: AvaChannel;
  message: string;
  sessionId: string;
  employeeId?: string | null;
}): Promise<AvaBrainReply> {
  const channel = params.channel;
  const message = params.message.trim();
  const personId = personIdFromEmployee(params.employeeId);
  const session = await loadSharedSession(params.sessionId);

  console.info(channel === "ADMIN_WEB" ? "AVA_CHANNEL_ADMIN" : "AVA_CHANNEL_ANDROID");

  if (isAvaSelfIntro(message)) {
    console.info("AVA_INTENT_IDENTITY");
    return reply(channel, personId, AVA_IDENTITY_SPOKEN, "SOURCE_IDENTITY", null, false);
  }

  {
    const { detectAvaStockQuestion } = await import("@/lib/ava/stock-question");
    const stockQ = detectAvaStockQuestion(message, {});
    if (stockQ) {
      const {
        getAvaStockSummaryReadonly,
        formatAvaStockSummaryAnswer,
        formatAvaProductStockDetail,
      } = await import("@/lib/ava/stock-summary");
      console.info(`AVA_INTENT_${stockQ.intent}`);
      const spoken =
        stockQ.intent === "PRODUCT_STOCK_DETAIL"
          ? await formatAvaProductStockDetail(stockQ.productHint, [])
          : formatAvaStockSummaryAnswer(
              stockQ.intent,
              await getAvaStockSummaryReadonly(),
              stockQ.storeHint,
            );
      await appendTurn(session, message, spoken);
      return reply(channel, personId, spoken, "SOURCE_ALLVAPS_STOCK", "stock_summary", false);
    }
  }

  const kind = classifyAvaNeed(message);
  console.info(`AVA_INTENT_${kind}`);

  if (kind === "MEMORY" || extractMemorizeFact(message)) {
    const memorize = extractMemorizeFact(message);
    if (memorize) {
      await saveSharedFact({
        personId,
        kind: "confirmed_fact",
        subject: memorize.subject,
        content: memorize.content,
        source: "user",
      });
      const spoken = "C'est noté, je m'en souviendrai.";
      await appendTurn(session, message, spoken);
      return reply(channel, personId, spoken, "SOURCE_MEMORY", "memory_lookup", true);
    }
    const persistent = await loadSharedPersistentMemory(personId);
    const recalled = tryAnswerFromConfirmedMemory(message, persistent);
    if (recalled) {
      await appendTurn(session, message, recalled.text);
      return reply(channel, personId, recalled.text, "SOURCE_MEMORY", "memory_lookup", true);
    }
  }

  if (kind === "PRODUCT") {
    try {
      const svc = getAvaCatalogService();
      const ranked = await svc.searchProducts(expandQuery(message), {
        limit: 8,
        inStockOnly: /disponible|en stock|en rayon/i.test(message) ? true : false,
        flavorFamily: /fruits? rouges?/i.test(message)
          ? "fruits_rouges"
          : /exotique/i.test(message)
            ? "exotique"
            : undefined,
      });
      const results = ranked.map((r) => ({
        name: toAvaProductCard(r, r.reason).name,
        availabilityStatus: r.outOfStockExact
          ? "rupture"
          : r.product.availableQuantity <= 3
            ? "stock_faible"
            : "disponible",
      }));
      const spoken = speakProducts(results);
      const source = /disponible|en stock|en rayon|stock/i.test(message)
        ? "SOURCE_ALLVAPS_STOCK"
        : "SOURCE_ALLVAPS";
      session.lastProductQuery = message;
      await appendTurn(session, message, spoken);
      return reply(channel, personId, spoken, source, "search_allvaps_products", false);
    } catch (error) {
      console.warn("AVA_TOOL_ERROR tool=search_allvaps_products");
      console.warn("AVA_TOOL_ERROR", error instanceof Error ? error.name : "unknown");
      return reply(
        channel,
        personId,
        "Je n'arrive pas à consulter le stock pour le moment.",
        "SOURCE_ALLVAPS_STOCK",
        "search_allvaps_products",
        false,
      );
    }
  }

  if (kind === "WEB") {
    try {
      const hits = await searchWebForAva(message, 3);
      const spoken = speakWebHits(message, hits);
      await appendTurn(session, message, spoken);
      return reply(channel, personId, spoken, "SOURCE_WEB", "web_search", false);
    } catch (error) {
      console.warn("AVA_TOOL_ERROR tool=web_search");
      console.warn("AVA_TOOL_ERROR", error instanceof Error ? error.name : "unknown");
      return reply(
        channel,
        personId,
        "Je n'arrive pas à accéder à Internet pour le moment.",
        "SOURCE_WEB",
        "web_search",
        false,
      );
    }
  }

  if (kind === "CLOCK") {
    const spoken = speakShopClock(getShopClock());
    await appendTurn(session, message, spoken);
    return reply(channel, personId, spoken, "SOURCE_SHOP_CLOCK", "shop_clock", false);
  }

  if (kind === "BUSINESS") {
    const clock = getShopClock();
    const lines = stores.map(
      (s) => `${s.name}, ${s.address}, ${s.postalCode} ${s.city}. ${s.hours[0]}.`,
    );
    const spoken = `${speakShopOpenClosed(clock)} On a deux boutiques. ${lines.join(" ")}`;
    await appendTurn(session, message, spoken);
    return reply(channel, personId, spoken, "SOURCE_ALLVAPS_SITE", "search_allvaps_knowledge", false);
  }

  const persistent = await loadSharedPersistentMemory(personId);
  const memoryLine = persistent.items
    .filter((i) => i.status === "active")
    .slice(0, 8)
    .map((i) => `- ${i.subject}: ${i.content}`)
    .join("\n");
  const history = session.turns.slice(-8);

  const llm = await chatWithAvaLlm({
    messages: [
      { role: "system", content: avaSystemPrompt(channel) },
      { role: "system", content: shopClockSystemLine(getShopClock()) },
      ...(memoryLine
        ? [{ role: "system" as const, content: `MÉMOIRE PARTAGÉE :\n${memoryLine}` }]
        : []),
      ...history.map((t) => ({ role: t.role as "user" | "assistant", content: t.content })),
      { role: "user", content: message },
    ],
    preferShort: channel === "ANDROID",
    maxTokens: channel === "ANDROID" ? 180 : 320,
    logTag: `ava-brain-${channel.toLowerCase()}`,
  });
  const text =
    llm.ok && llm.text?.trim()
      ? llm.text.trim().slice(0, 420)
      : "J'ai un problème pour répondre pour le moment.";
  await appendTurn(session, message, text);
  return reply(
    channel,
    personId,
    text,
    "SOURCE_LLM",
    null,
    Boolean(memoryLine),
  );
}

async function appendTurn(
  session: Awaited<ReturnType<typeof loadSharedSession>>,
  user: string,
  assistant: string,
) {
  session.turns = [
    ...session.turns,
    { role: "user", content: user.slice(0, 500) },
    { role: "assistant", content: assistant.slice(0, 500) },
  ].slice(-12);
  try {
    await saveSharedSession(session);
  } catch (error) {
    console.warn("AVA_MEMORY_WRITE_ERROR AVA_MEMORY_ERROR scope=session_append");
    console.warn("AVA_MEMORY_WRITE_ERROR", error instanceof Error ? error.name : "unknown");
  }
}
