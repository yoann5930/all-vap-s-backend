/**
 * Bibliothèque vidéo pédagogique A.V.A.
 */
import fs from "node:fs";
import path from "node:path";

export type AvaVideoStatus = "DRAFT" | "PENDING_REVIEW" | "VERIFIED" | "ARCHIVED";
export type AvaVideoSourceStatus = "A_FOURNIR" | "RUSH_OK" | "MONTE" | "VALIDE";
export type AvaVideoFormat = "LONG_PEDAGOGIQUE" | "SHORT_HELP";

export type AvaVideoChapter = {
  id: string;
  title: string;
  startSeconds: number;
};

export type AvaVideo = {
  id: string;
  slug: string;
  title: string;
  shortTitle?: string;
  description: string;
  category: string;
  formatType: AvaVideoFormat;
  durationSeconds: number;
  level: string;
  brands: string[];
  models: string[];
  deviceFamilies: string[];
  symptoms: string[];
  errorCodes: string[];
  exclusions: string[];
  prerequisites: string[];
  safetyLevel: "info" | "attention" | "critique";
  chapters: AvaVideoChapter[];
  transcriptPath: string | null;
  subtitles: { lang: string; path: string }[];
  thumbnailPath: string | null;
  videoPath: string | null;
  fallbackText: string;
  status: AvaVideoStatus;
  sourceStatus: AvaVideoSourceStatus;
  verifiedBy: string | null;
  updatedAt: string;
};

export type AvaVideoLibraryFile = {
  version: string;
  updatedAt: string;
  status: string;
  note?: string;
  videos: AvaVideo[];
};

function loadJson<T>(rel: string, fallback: T): T {
  const p = path.join(process.cwd(), rel);
  if (!fs.existsSync(p)) return fallback;
  return JSON.parse(fs.readFileSync(p, "utf8")) as T;
}

let cache: AvaVideoLibraryFile | null = null;

export function loadVideoLibrary(force = false): AvaVideoLibraryFile {
  if (cache && !force) return cache;
  cache = loadJson<AvaVideoLibraryFile>("data/ava/videos/video-library.json", {
    version: "0",
    updatedAt: "",
    status: "EMPTY",
    videos: [],
  });
  return cache;
}

export function getAllVideos(): AvaVideo[] {
  return loadVideoLibrary().videos || [];
}

export function getVideoById(id: string): AvaVideo | null {
  return getAllVideos().find((v) => v.id === id) ?? null;
}

export function getVideoBySlug(slug: string): AvaVideo | null {
  return getAllVideos().find((v) => v.slug === slug) ?? null;
}

/** Vidéos proposables au client : VERIFIED + média présent. */
export function isVideoClientReady(v: AvaVideo): boolean {
  if (v.status !== "VERIFIED") return false;
  if (v.sourceStatus !== "VALIDE") return false;
  if (!v.videoPath) return false;
  const abs = path.join(process.cwd(), "public", v.videoPath.replace(/^\//, ""));
  return fs.existsSync(abs);
}

export function listClientReadyVideos(): AvaVideo[] {
  return getAllVideos().filter(isVideoClientReady);
}

export function getLibraryStats() {
  const lib = loadVideoLibrary();
  const videos = lib.videos || [];
  return {
    version: lib.version,
    libraryStatus: lib.status,
    total: videos.length,
    draft: videos.filter((v) => v.status === "DRAFT").length,
    verified: videos.filter((v) => v.status === "VERIFIED").length,
    ready: listClientReadyVideos().length,
    long: videos.filter((v) => v.formatType === "LONG_PEDAGOGIQUE").length,
    short: videos.filter((v) => v.formatType === "SHORT_HELP").length,
    missingMedia: videos.filter((v) => !v.videoPath).length,
  };
}
