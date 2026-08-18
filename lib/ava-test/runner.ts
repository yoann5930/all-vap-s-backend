/**
 * Banc de test AVA — appelle le vrai cerveau boutique (chatAva)
 * sans userId, donc sans écriture VapeProfile / commande / stock.
 *
 * Interdit : SDK LLM cloud, paiements, e-mails, fidélité externe, expéditions.
 */
import { chatAva, type AvaChatOptions, type AvaReply } from "@/lib/ai/ava-advisor";
import type { AvaConversationContext } from "@/lib/ai/ava";
import {
  detectAllDayNeed,
  detectExperienceFromMessage,
  parseCigarettesPerDay,
} from "@/lib/ava/advisor-policy";
import { AVA_TEST_ENGINE_USER_ID } from "@/lib/ava-test/write-guard";
import { newTestSession } from "@/lib/ava-test/presets";
import { collectTestEvents, resolveTestIntent } from "@/lib/ava-test/events";
import { nicotineDecisionFromSession } from "@/lib/ava-test/nicotine-view";
import { avaTestLog } from "@/lib/ava-test/log";
import {
  getTestSession,
  putTestSession,
  readSessionResume,
  signSessionResume,
} from "@/lib/ava-test/session-store";
import { planTtsSegments } from "@/lib/ava-test/tts-plan";
import {
  AVA_TEST_MODE,
  type AvaTestOkResponse,
  type AvaTestProfilePreset,
  type AvaTestRecommendedProduct,
  type AvaTestSessionRecord,
  type AvaTestTurnRequest,
} from "@/lib/ava-test/types";

export const AVA_TEST_ROUTE = "/api/internal/ava-test";
export const AVA_TEST_ENGINE_NAME = "chatAva";

type ChatOpts = AvaChatOptions & { conversationContext?: AvaConversationContext };

export type AvaTestEngine = (
  userId: undefined,
  message: string,
  options?: ChatOpts,
) => Promise<AvaReply>;

let engineOverride: AvaTestEngine | null = null;

/** Uniquement pour les tests unitaires — jamais en production. */
export function setAvaTestEngineForTests(engine: AvaTestEngine | null) {
  engineOverride = engine;
}

function publicSiteOrigin(): string {
  const raw = (process.env.NEXT_PUBLIC_APP_URL || "https://www.allvaps.fr").replace(/\/$/, "");
  return raw || "https://www.allvaps.fr";
}

function parseUsedNicotineMg(message: string): number | null {
  const m = message.match(/\b(\d+(?:[.,]\d+)?)\s*mg\b/i);
  if (!m) return null;
  const n = Number(String(m[1]).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function parseYearsVaping(message: string): number | null {
  const m = message.match(/depuis\s+(\d+)\s+ans/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function mergeSessionFromMessage(session: AvaTestSessionRecord, message: string): AvaTestSessionRecord {
  const cigs = parseCigarettesPerDay(message);
  const allDay = detectAllDayNeed(message);
  const nic = parseUsedNicotineMg(message);
  const years = parseYearsVaping(message);
  const level = detectExperienceFromMessage(message, session.experienceLevel);
  const tubes = /tube/i.test(message);
  return {
    ...session,
    cigarettesPerDay: cigs ?? session.cigarettesPerDay,
    allDayNeed: allDay ?? session.allDayNeed,
    nicotineMg: nic ?? session.nicotineMg,
    yearsVaping: years ?? session.yearsVaping,
    cigaretteType: tubes ? "TUBES" : session.cigaretteType,
    experienceLevel: level,
    conversationContext: {
      ...session.conversationContext,
      experienceLevel: level,
      cigarettesPerDay: cigs ?? session.conversationContext.cigarettesPerDay ?? session.cigarettesPerDay,
      allDayNeed: allDay ?? session.conversationContext.allDayNeed ?? session.allDayNeed,
      nicotineMg: nic ?? session.conversationContext.nicotineMg ?? session.nicotineMg,
      memoryLoaded: true,
    },
  };
}

function productsFromReply(reply: AvaReply): AvaTestRecommendedProduct[] {
  const cards = reply.products || [];
  return cards.slice(0, 6).map((p, i) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    primary: i === 0,
    available: typeof p.stock === "number" ? p.stock > 0 : true,
    imageUrl: p.imageUrl ?? null,
    url: `${publicSiteOrigin()}/boutique/${p.slug}`,
  }));
}

function loadOrCreateSession(req: AvaTestTurnRequest, resumeToken?: string): AvaTestSessionRecord {
  const existing = getTestSession(req.sessionId);
  if (existing) {
    if (req.profilePreset && req.profilePreset !== existing.profilePreset && existing.turnCount === 0) {
      return newTestSession({
        sessionId: req.sessionId,
        preset: req.profilePreset,
        profile: { ...existing.profile, ...req.profile },
      });
    }
    return existing;
  }
  const resumed = readSessionResume(resumeToken);
  if (resumed && resumed.sessionId === req.sessionId) {
    putTestSession(resumed);
    return resumed;
  }
  const preset: AvaTestProfilePreset = req.profilePreset ?? "BEGINNER";
  return newTestSession({
    sessionId: req.sessionId,
    preset,
    profile: req.profile,
  });
}

export async function runAvaTestTurn(
  req: AvaTestTurnRequest,
  opts?: { resumeToken?: string },
): Promise<AvaTestOkResponse> {
  const started = Date.now();
  let session = loadOrCreateSession(req, opts?.resumeToken);
  session = mergeSessionFromMessage(session, req.message);

  const engine: AvaTestEngine = engineOverride ?? ((userId, message, options) =>
    chatAva(userId, message, options));

  const reply = await engine(AVA_TEST_ENGINE_USER_ID, req.message, {
    conversationContext: session.conversationContext,
  });

  if (reply.conversationContext) {
    session.conversationContext = {
      ...session.conversationContext,
      ...reply.conversationContext,
    };
  }
  if (session.conversationContext.cigarettesPerDay != null) {
    session.cigarettesPerDay = session.conversationContext.cigarettesPerDay;
  }
  if (session.conversationContext.allDayNeed != null) {
    session.allDayNeed = session.conversationContext.allDayNeed;
  }
  if (session.conversationContext.nicotineMg != null) {
    session.nicotineMg = session.conversationContext.nicotineMg;
  }
  if (session.conversationContext.experienceLevel) {
    session.experienceLevel = session.conversationContext.experienceLevel;
  }
  session.turnCount += 1;
  session = putTestSession(session);

  const products = productsFromReply(reply);
  const nicotineDecision = nicotineDecisionFromSession(session, session.experienceLevel);
  const tts = planTtsSegments(reply.content || "");
  const intent = resolveTestIntent(session, req.message);
  const events = collectTestEvents({
    session,
    message: req.message,
    experienceLevel: session.experienceLevel,
    memoryLoaded: true,
    productCount: products.length,
    nicotineCalculated: nicotineDecision != null,
    ttsQueued: tts.queued,
  });

  const latencyMs = Date.now() - started;
  avaTestLog("turn", {
    session: session.sessionId,
    intent,
    result: "ok",
    latencyMs,
    experienceLevel: session.experienceLevel,
    products: products.length,
  });

  return {
    ok: true,
    sessionId: session.sessionId,
    avaText: reply.content || "",
    intent,
    experienceLevel: session.experienceLevel,
    memoryLoaded: true,
    nicotineDecision,
    recommendedProducts: products,
    tts,
    events,
    testAccountId: session.testAccountId,
    diagnostics: {
      route: AVA_TEST_ROUTE,
      engine: AVA_TEST_ENGINE_NAME,
      latencyMs,
      testMode: AVA_TEST_MODE,
      writeScope: "READ_PLUS_SIMULATE",
      sessionResumeToken: signSessionResume(session),
    },
  };
}
