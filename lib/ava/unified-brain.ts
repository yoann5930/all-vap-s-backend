/**
 * Cerveau AVA unique (ava-main) — Android et Admin s'y branchent.
 * Catalogue / stock : lecture seule. Internet : serveur uniquement.
 */
import { getAvaCatalogService } from "@/lib/ai/ava";
import { toAvaProductCard } from "@/lib/ai/ava/response-builder";
import { chatWithAvaLlm, spokenLocalLlmFailure } from "@/lib/ava/production-llm";
import { searchWebForAva, speakWebHits } from "@/lib/ava/android-web-search";
import { getShopClock, shopClockSystemLine, speakShopClock } from "@/lib/ava/shop-clock";
import {
  AVA_PUBLIC_CONFIDENTIAL_DENIAL,
  avaAudiencePrompt,
  isConfidentialAsk,
  isInternalChannel,
  scrubPublicReply,
  type AvaAudience,
  type AvaSurface,
} from "@/lib/ava/ava-channels";
import { runAdminToolPlan } from "@/lib/ava/admin-tools";
import { AVA_LOYALTY_NOT_WIRED, speakAllVapsShops } from "@/lib/ava/shop-facts";
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
  saveSharedSession,
  tryAnswerFromConfirmedMemory,
  type AvaPersonId,
} from "@/lib/ava/shared-memory";
import { classifyAvaNeed, type AvaNeed } from "@/lib/ava/intents";
import { avaLog, newAvaCorrelationId } from "@/lib/ava/logging";
import { speakAvaStock } from "@/lib/ava/tools/stock-query";
import { speakAvaOrders } from "@/lib/ava/tools/order-query";
import { speakAvaEmailStatus } from "@/lib/ava/tools/email-query";
import { speakAvaShipping } from "@/lib/ava/tools/shipping-status";
import { checkupTargetFromMessage, runAvaCheckup } from "@/lib/ava/health/checkup";
import { searchVapeKnowledge } from "@/lib/ava/vape-knowledge";
import { AvaMemoryService } from "@/lib/ava/memory-service";

export type { AvaNeed };
export { classifyAvaNeed };

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
  audience?: AvaAudience;
  surface?: AvaSurface;
  correlationId?: string;
}): Promise<AvaBrainReply> {
  const channel = params.channel;
  const audience = params.audience ?? (isInternalChannel(channel) ? "internal" : "public");
  const surface: AvaSurface =
    params.surface ?? (channel === "ADMIN_WEB" ? "admin_web" : "vendeuse");
  const access = { channel, audience, surface };
  const message = params.message.trim();
  const personId = personIdFromEmployee(params.employeeId);
  const correlationId = params.correlationId || newAvaCorrelationId();
  const session = await loadSharedSession(params.sessionId);

  console.info(channel === "ADMIN_WEB" ? "AVA_CHANNEL_ADMIN" : "AVA_CHANNEL_VENDEUSE");
  avaLog("CORE", correlationId, "brain", { channel, audience });

  if (isAvaSelfIntro(message)) {
    console.info("AVA_INTENT_IDENTITY");
    return reply(channel, personId, AVA_IDENTITY_SPOKEN, "SOURCE_IDENTITY", null, false);
  }

  let kind: AvaNeed =
    session.nicotineInterview && classifyAvaNeed(message) !== "MEMORY"
      ? "NICOTINE"
      : classifyAvaNeed(message);
  if (isConfidentialAsk(message)) kind = "ADMIN_OPS";
  console.info(`AVA_INTENT_${kind}`);
  avaLog("CORE", correlationId, `intent_${kind}`);

  if (kind === "MEMORY" || extractMemorizeFact(message)) {
    const memorize = extractMemorizeFact(message);
    if (memorize) {
      const saved = await AvaMemoryService.writeFact({
        personId,
        subject: memorize.subject,
        content: memorize.content,
        correlationId,
        scope: "PERSISTENT_MEMORY",
      });
      const spoken = saved
        ? "C'est noté, je m'en souviendrai."
        : "Je ne peux pas mémoriser cette information.";
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

  if (kind === "NICOTINE") {
    const { continueNicotineDialogue } = await import("@/lib/nicotine");
    const turn = continueNicotineDialogue(session.nicotineInterview ?? null, message);
    session.nicotineInterview = turn.done ? null : turn.interview;
    await appendTurn(session, message, turn.spoken);
    return reply(channel, personId, turn.spoken, "SOURCE_NICOTINE", "nicotine_module", false);
  }

  if (kind === "SYSTEM_HEALTH" || kind === "SYSTEM_STATUS") {
    const target = checkupTargetFromMessage(message);
    const check = await runAvaCheckup({ correlationId, only: target });
    await appendTurn(session, message, check.spoken);
    return reply(channel, personId, check.spoken, "SOURCE_HEALTH", "system_health", false);
  }

  if (kind === "STOCK") {
    const stock = await speakAvaStock(message, correlationId, {
      allowBoutiqueSplit: audience === "internal",
    });
    await appendTurn(session, message, stock.spoken);
    return reply(channel, personId, stock.spoken, "SOURCE_ALLVAPS_STOCK", "stock_query", false);
  }

  if (kind === "ORDER") {
    if (audience !== "internal") {
      await appendTurn(session, message, AVA_PUBLIC_CONFIDENTIAL_DENIAL);
      return reply(
        channel,
        personId,
        AVA_PUBLIC_CONFIDENTIAL_DENIAL,
        "SOURCE_CHANNEL_POLICY",
        null,
        false,
      );
    }
    const orders = await speakAvaOrders(message, correlationId);
    await appendTurn(session, message, orders.spoken);
    return reply(channel, personId, orders.spoken, "SOURCE_ORDERS", "order_query", false);
  }

  if (kind === "EMAIL") {
    if (audience !== "internal") {
      await appendTurn(session, message, AVA_PUBLIC_CONFIDENTIAL_DENIAL);
      return reply(
        channel,
        personId,
        AVA_PUBLIC_CONFIDENTIAL_DENIAL,
        "SOURCE_CHANNEL_POLICY",
        null,
        false,
      );
    }
    const mail = await speakAvaEmailStatus(correlationId);
    await appendTurn(session, message, mail.spoken);
    return reply(channel, personId, mail.spoken, "SOURCE_MAIL", "email_status", false);
  }

  if (kind === "SHIPPING") {
    const ship = speakAvaShipping(correlationId);
    await appendTurn(session, message, ship.spoken);
    return reply(channel, personId, ship.spoken, "SOURCE_SHIPPING", "shipping_status", false);
  }

  if (kind === "VAPE_KNOWLEDGE") {
    const hits = searchVapeKnowledge(message, 1);
    if (hits[0]?.content) {
      const spoken = hits[0].content.slice(0, 420);
      await appendTurn(session, message, spoken);
      return reply(channel, personId, spoken, "SOURCE_VAPE_KNOWLEDGE", "vape_knowledge", false);
    }
  }

  if (kind === "ADMIN_OPS") {
    if (audience !== "internal") {
      await appendTurn(session, message, AVA_PUBLIC_CONFIDENTIAL_DENIAL);
      return reply(
        channel,
        personId,
        AVA_PUBLIC_CONFIDENTIAL_DENIAL,
        "SOURCE_CHANNEL_POLICY",
        null,
        false,
      );
    }
    try {
      const tools = await runAdminToolPlan(message, {
        role: "ADMIN",
        appRole: "ADMIN",
        email: "",
        userId: personId,
        message,
      });
      const spoken =
        tools.factsText.trim() ||
        "J'ai regardé en interne : rien de net pour le moment.";
      await appendTurn(session, message, spoken);
      return reply(
        channel,
        personId,
        spoken.slice(0, 900),
        "SOURCE_ADMIN_TOOLS",
        tools.plan.tools[0] || "admin_tools",
        false,
      );
    } catch (error) {
      console.warn("AVA_TOOL_ERROR tool=admin_ops");
      console.warn("AVA_TOOL_ERROR", error instanceof Error ? error.name : "unknown");
      return reply(
        channel,
        personId,
        "Je n'arrive pas à consulter les outils internes pour le moment.",
        "SOURCE_ADMIN_TOOLS",
        "admin_tools",
        false,
      );
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

  if (kind === "LOYALTY") {
    console.info("FIDELATOO_CUSTOMER_LOOKUP status=not_implemented");
    await appendTurn(session, message, AVA_LOYALTY_NOT_WIRED);
    return reply(channel, personId, AVA_LOYALTY_NOT_WIRED, "SOURCE_ALLVAPS_SITE", "loyalty_status", false);
  }

  if (kind === "SITE") {
    const spoken = await speakSiteHealth();
    await appendTurn(session, message, spoken);
    return reply(channel, personId, spoken, "SOURCE_ALLVAPS_SITE", "site_health", false);
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
    const spoken = speakAllVapsShops(getShopClock());
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
      { role: "system", content: avaAudiencePrompt(access) },
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
  const rawLlm =
    llm.ok && llm.text?.trim()
      ? llm.text.trim().slice(0, 420)
      : spokenLocalLlmFailure(llm.category);
  const text = audience === "public" ? scrubPublicReply(rawLlm) : rawLlm;
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

async function speakSiteHealth(): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch("https://www.allvaps.fr/api/health", {
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      return "Je n'arrive pas à confirmer l'état du site pour le moment.";
    }
    const data = (await res.json()) as {
      status?: string;
      checks?: { database?: string };
    };
    if (data.status === "ok" && data.checks?.database === "ok") {
      return "Oui, le site All Vap's répond. La base catalogue est joignable.";
    }
    if (data.status === "ok") {
      return "Le site All Vap's répond. Je n'ai pas le détail de tous les contrôles.";
    }
    return "Le site All Vap's répond, mais un contrôle n'est pas au vert.";
  } catch {
    return "Je n'arrive pas à confirmer l'état du site pour le moment.";
  } finally {
    clearTimeout(timer);
  }
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
