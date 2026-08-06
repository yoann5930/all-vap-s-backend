import { NextRequest, NextResponse } from "next/server";
import { handleApiError, jsonResponse } from "@/lib/api-utils";
import { clientIp } from "@/lib/rate-limit";
import type { FidelatooCommand, FidelatooStoreCode } from "./types";
import { runFidelatooCommand, getFidelatooStatus } from "./orchestrator";
import {
  auditFidelatooAction,
  noStoreHeaders,
  requireFidelatooAdmin,
  requireFidelatooMutation,
} from "./admin-guard";

export async function handleStatusGet(request: NextRequest) {
  try {
    await requireFidelatooAdmin(request);
    const status = await getFidelatooStatus();
    return NextResponse.json(status, { headers: noStoreHeaders() });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function handleCommandPost(
  request: NextRequest,
  command: FidelatooCommand,
  extras?: { store?: FidelatooStoreCode; allow?: boolean }
) {
  try {
    const user = await requireFidelatooMutation(request);
    const result = await runFidelatooCommand(command, extras);

    await auditFidelatooAction({
      user,
      command,
      actionId: result.actionId,
      ok: result.ok,
      message: result.message,
      ip: clientIp(request),
      metadata: extras?.store ? { store: extras.store, allow: extras.allow } : undefined,
    });

    // Ne jamais renvoyer le QR dans les réponses JSON génériques
    const { qrImageBase64: _q, ...safe } = result;
    void _q;

    return NextResponse.json(
      {
        ok: safe.ok,
        actionId: safe.actionId,
        command: safe.command,
        message: safe.message,
        status: safe.status || (await getFidelatooStatus()),
        qrExpiresAt: safe.qrExpiresAt ?? null,
        qrReady: !!result.qrImageBase64 || !!safe.qrExpiresAt,
      },
      { status: result.ok ? 200 : 502, headers: noStoreHeaders() }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export { jsonResponse };
