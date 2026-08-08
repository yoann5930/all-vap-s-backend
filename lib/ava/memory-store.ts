/**
 * Mémoires A.V.A. séparées — jamais de mélange Admin/Client.
 * ownerUserId vide ("") = entrée globale (ex. OPERATIONAL).
 */
import prisma from "@/lib/prisma";
import { AvaError, AvaErrorCode } from "@/lib/ava/errors";

export type AvaMemoryScope = "ADMIN" | "CLIENT" | "OPERATIONAL";

function ownerKey(ownerUserId?: string | null): string {
  return ownerUserId?.trim() || "";
}

export async function getAvaMemory(params: {
  scope: AvaMemoryScope;
  ownerUserId?: string | null;
  key: string;
}): Promise<unknown | null> {
  try {
    const row = await prisma.avaMemoryEntry.findUnique({
      where: {
        scope_ownerUserId_key: {
          scope: params.scope,
          ownerUserId: ownerKey(params.ownerUserId),
          key: params.key,
        },
      },
    });
    return row?.valueJson ?? null;
  } catch (e) {
    throw new AvaError(
      AvaErrorCode.AVA_MEMORY_UNAVAILABLE,
      e instanceof Error ? e.message : "Lecture mémoire impossible"
    );
  }
}

export async function setAvaMemory(params: {
  scope: AvaMemoryScope;
  ownerUserId?: string | null;
  key: string;
  value: unknown;
  source?: string;
}): Promise<void> {
  if (params.scope === "ADMIN" && !params.ownerUserId) {
    throw new AvaError(
      AvaErrorCode.AVA_PERMISSION_DENIED,
      "Mémoire Admin sans ownerUserId"
    );
  }
  if (params.scope === "CLIENT" && !params.ownerUserId) {
    throw new AvaError(
      AvaErrorCode.AVA_PERMISSION_DENIED,
      "Mémoire Client sans ownerUserId"
    );
  }
  try {
    const oid = ownerKey(params.ownerUserId);
    await prisma.avaMemoryEntry.upsert({
      where: {
        scope_ownerUserId_key: {
          scope: params.scope,
          ownerUserId: oid,
          key: params.key,
        },
      },
      create: {
        scope: params.scope,
        ownerUserId: oid,
        key: params.key,
        valueJson: params.value as object,
        source: params.source,
      },
      update: {
        valueJson: params.value as object,
        source: params.source,
      },
    });
  } catch (e) {
    throw new AvaError(
      AvaErrorCode.AVA_MEMORY_UNAVAILABLE,
      e instanceof Error ? e.message : "Écriture mémoire impossible"
    );
  }
}

/** Never return ADMIN memory to CLIENT surface. */
export async function loadMemoryForSurface(params: {
  surface: "admin" | "client";
  userId: string;
  adminCapabilities: boolean;
}): Promise<{ admin?: unknown; client?: unknown; operational?: unknown }> {
  const out: { admin?: unknown; client?: unknown; operational?: unknown } = {};
  try {
    out.operational = await getAvaMemory({
      scope: "OPERATIONAL",
      key: "catalog_hints",
    });
  } catch {
    /* optional */
  }
  try {
    out.client = await getAvaMemory({
      scope: "CLIENT",
      ownerUserId: params.userId,
      key: "preferences",
    });
  } catch {
    /* optional */
  }
  if (params.surface === "admin" && params.adminCapabilities) {
    try {
      out.admin = await getAvaMemory({
        scope: "ADMIN",
        ownerUserId: params.userId,
        key: "workspace",
      });
    } catch {
      /* optional */
    }
  }
  return out;
}
