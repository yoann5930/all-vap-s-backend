import { NextRequest, NextResponse } from "next/server";
import { runHardwareDiagnostic } from "@/lib/ava/hardware-diagnostic";
import type { ConfirmedDeviceContext } from "@/lib/ava/device-confirmation";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      message?: string;
      deviceContext?: ConfirmedDeviceContext | null;
      diagnosticSession?: import("@/lib/ava/diagnostic-session").DiagnosticSession | null;
    };
    const message = (body.message || "").trim();
    if (!message) {
      return NextResponse.json({ error: "message requis" }, { status: 400 });
    }
    const result = runHardwareDiagnostic({
      message,
      deviceContext: body.deviceContext ?? null,
      diagnosticSession: body.diagnosticSession ?? null,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[ava/analyze-hardware]", err);
    return NextResponse.json(
      {
        phase: "shop",
        content:
          "Je préfère que l'équipe vérifie directement votre matériel pour éviter de vous faire prendre un risque.",
        assistanceMode: true,
      },
      { status: 200 }
    );
  }
}
