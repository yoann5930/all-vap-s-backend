/**
 * Inbox SumUp — détection CSV, hash SHA-256, anti double-import.
 * Ne remplace pas le connecteur : l’enrichit.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import prisma from "@/lib/prisma";

export function getSumUpInboxDir(root = process.cwd()): string {
  return path.resolve(root, process.env.SUMUP_INBOX_PATH || "inbox_sumup");
}

export function sha256Content(content: string | Buffer): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export type InboxCsvCandidate = {
  fullPath: string;
  fileName: string;
  mtimeMs: number;
  size: number;
};

/** Liste les CSV articles SumUp dans l’inbox (plus récent en premier). */
export function listInboxItemsExportCsv(root = process.cwd()): InboxCsvCandidate[] {
  const dir = getSumUpInboxDir(root);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /items-export.*\.csv$/i.test(f) || /sumup.*\.csv$/i.test(f))
    .filter((f) => !f.startsWith("."))
    .map((f) => {
      const fullPath = path.join(dir, f);
      const st = fs.statSync(fullPath);
      return {
        fullPath,
        fileName: f,
        mtimeMs: st.mtimeMs,
        size: st.size,
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

export function findLatestItemsExportCsv(root = process.cwd()): string | null {
  return listInboxItemsExportCsv(root)[0]?.fullPath ?? null;
}

export async function findProcessedInboxByHash(fileHash: string) {
  return prisma.sumUpInboxFile.findUnique({ where: { fileHash } });
}

export async function recordInboxProcessed(params: {
  fileName: string;
  fileHash: string;
  filePath?: string | null;
  status: "IMPORTED" | "SKIPPED_DUPLICATE" | "FAILED";
  syncRunId?: string | null;
  stats?: Record<string, unknown>;
}) {
  return prisma.sumUpInboxFile.upsert({
    where: { fileHash: params.fileHash },
    create: {
      fileName: params.fileName,
      fileHash: params.fileHash,
      filePath: params.filePath ?? null,
      status: params.status,
      syncRunId: params.syncRunId ?? null,
      statsJson: params.stats ? JSON.stringify(params.stats) : null,
    },
    update: {
      fileName: params.fileName,
      filePath: params.filePath ?? null,
      status: params.status,
      syncRunId: params.syncRunId ?? null,
      statsJson: params.stats ? JSON.stringify(params.stats) : null,
      processedAt: new Date(),
    },
  });
}
