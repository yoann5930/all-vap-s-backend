import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/jwt";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireAuth("ADMIN");
  } catch {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const limit = Math.min(100, Number(req.nextUrl.searchParams.get("limit") || 50));

  const runs = await prisma.syncRun.findMany({
    orderBy: { startedAt: "desc" },
    take: limit,
    include: {
      _count: { select: { errors: true, matches: true } },
    },
  });

  const inbox = await prisma.sumUpInboxFile.findMany({
    orderBy: { processedAt: "desc" },
    take: 50,
  });

  return NextResponse.json({
    runs: runs.map((r) => {
      let report: Record<string, unknown> | null = null;
      try {
        report = r.reportJson ? JSON.parse(r.reportJson) : null;
      } catch {
        report = null;
      }
      return {
        id: r.id,
        source: r.source,
        status: r.status,
        dryRun: r.dryRun,
        startedAt: r.startedAt.toISOString(),
        completedAt: r.completedAt?.toISOString() ?? null,
        fileName: r.fileName,
        fileHash: r.fileHash,
        importedCount: r.importedCount,
        updatedCount: r.updatedCount,
        unchangedCount: r.unchangedCount,
        createCount: r.createCount,
        duplicateCount: r.duplicateCount,
        unmatchedCount: r.unmatchedCount,
        errorCount: r.errorCount,
        errorSummary: r.errorSummary,
        report,
        errorsCount: r._count.errors,
        matchesCount: r._count.matches,
      };
    }),
    inboxFiles: inbox.map((f) => ({
      id: f.id,
      fileName: f.fileName,
      fileHash: f.fileHash,
      status: f.status,
      processedAt: f.processedAt.toISOString(),
      syncRunId: f.syncRunId,
      stats: f.statsJson ? JSON.parse(f.statsJson) : null,
    })),
  });
}
