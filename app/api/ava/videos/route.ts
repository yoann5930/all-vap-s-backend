import { NextRequest, NextResponse } from "next/server";
import {
  getLibraryStats,
  getVideoById,
  getVideoBySlug,
  listClientReadyVideos,
  loadVideoLibrary,
} from "@/lib/ava/video/videoLibrary";
import { matchVideosForContext } from "@/lib/ava/video/videoMatcher";
import { sanitizeVideoForClient, isExcludedVideoContext } from "@/lib/ava/video/videoSafety";
import { trackVideoEvent } from "@/lib/ava/video/videoAnalytics";

export const dynamic = "force-dynamic";

/** GET /api/ava/videos — stats + liste (ready only par défaut) */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const slug = searchParams.get("slug");
  const all = searchParams.get("all") === "1";

  if (id) {
    const v = getVideoById(id);
    if (!v) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ video: sanitizeVideoForClient(v) });
  }
  if (slug) {
    const v = getVideoBySlug(slug);
    if (!v) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ video: sanitizeVideoForClient(v) });
  }

  loadVideoLibrary(true);
  const stats = getLibraryStats();
  const videos = (all ? loadVideoLibrary().videos : listClientReadyVideos()).map(sanitizeVideoForClient);
  return NextResponse.json({
    stats,
    videos,
    note: "Seules les vidéos VERIFIED + média présent sont « ready ». Le reste est préproduction.",
  });
}

/** POST /api/ava/videos — recommandation selon message / contexte */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const message = String(body.message || "");
  const excl = isExcludedVideoContext(message);
  if (excl.excluded) {
    return NextResponse.json({ excluded: true, reason: excl.reason, recommendations: [] });
  }

  const recs = matchVideosForContext({
    message,
    deviceFamily: body.deviceFamily ?? null,
    deviceModel: body.deviceModel ?? null,
    deviceConfirmed: Boolean(body.deviceConfirmed),
    errorCode: body.errorCode ?? null,
    symptoms: body.symptoms ?? [],
    diagnosticActive: Boolean(body.diagnosticActive),
    allowDraftFallbackText: body.allowDraftFallbackText !== false,
  });

  trackVideoEvent("recommend", recs[0]?.video.id, { count: recs.length });
  return NextResponse.json({
    excluded: false,
    recommendations: recs,
    preproduction: getLibraryStats().ready === 0,
  });
}
