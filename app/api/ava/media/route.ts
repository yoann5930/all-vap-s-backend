import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

const MAX_BYTES = 80 * 1024 * 1024;
const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

/** TTL fichiers médias (heures) — suppression différée via timestamp dans le nom. */
const RETENTION_HOURS = Number(process.env.AVA_MEDIA_RETENTION_HOURS || 24);

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const consent = String(form.get("consent") || "");
    if (consent !== "true") {
      return NextResponse.json(
        { error: "Consentement requis pour analyser le fichier." },
        { status: 400 }
      );
    }
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Fichier manquant." }, { status: 400 });
    }
    if (!ALLOWED.has(file.type)) {
      return NextResponse.json(
        {
          error:
            "Format non supporté. Photo (JPG/PNG/WEBP) ou vidéo (MP4/MOV/WEBM) uniquement — pas de PDF ni documents.",
        },
        { status: 400 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Fichier trop volumineux." }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const dir = path.join(process.cwd(), "tmp", "ava-media");
    await mkdir(dir, { recursive: true });
    const expires = Date.now() + RETENTION_HOURS * 3600_000;
    const id = `${expires}-${randomUUID()}`;
    const ext = file.name.split(".").pop() || "bin";
    const dest = path.join(dir, `${id}.${ext}`);
    await writeFile(dest, buf);

    return NextResponse.json({
      ok: true,
      id,
      expiresAt: new Date(expires).toISOString(),
      retentionHours: RETENTION_HOURS,
      message:
        "Fichier reçu pour diagnostic uniquement. Suppression automatique après la durée configurée.",
    });
  } catch (err) {
    console.error("[ava/media]", err);
    return NextResponse.json({ error: "Envoi impossible." }, { status: 500 });
  }
}

/** Nettoyage manuel d'un fichier (après analyse). */
export async function DELETE(req: NextRequest) {
  try {
    const { id } = (await req.json()) as { id?: string };
    if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
    const dir = path.join(process.cwd(), "tmp", "ava-media");
    const { readdir } = await import("fs/promises");
    const files = await readdir(dir);
    const match = files.find((f) => f.startsWith(id));
    if (match) await unlink(path.join(dir, match));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Suppression impossible" }, { status: 500 });
  }
}
