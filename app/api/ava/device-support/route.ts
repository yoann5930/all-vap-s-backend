import { NextRequest, NextResponse } from "next/server";
import {
  getDeviceControls,
  getFillingProcedure,
  getCoilReplacementProcedure,
  listDevices,
  devicesWithoutOfficialManual,
} from "@/lib/ava/device-support";
import { getCompatibleCoils, getCompatibleCartridges } from "@/lib/ava/coil-compatibility";
import { getManualHelp, resolveManualSection } from "@/lib/ava/manual-search";
import type { ConfirmedDeviceContext } from "@/lib/ava/device-confirmation";

export async function GET() {
  return NextResponse.json({
    devices: listDevices().map((d) => ({
      manufacturer: d.manufacturer,
      model: d.model,
      modelSlug: d.modelSlug,
      verificationStatus: d.verificationStatus,
      hasManual: Boolean(d.officialManualUrl),
    })),
    withoutManual: devicesWithoutOfficialManual().map((d) => `${d.manufacturer} ${d.model}`),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      action?: string;
      message?: string;
      deviceContext?: ConfirmedDeviceContext | null;
    };
    const ctx = body.deviceContext ?? null;
    const action = body.action || "auto";

    if (action === "coils") return NextResponse.json(getCompatibleCoils(ctx));
    if (action === "cartridges") return NextResponse.json(getCompatibleCartridges(ctx));
    if (action === "controls") return NextResponse.json(getDeviceControls(ctx));
    if (action === "filling") return NextResponse.json(getFillingProcedure(ctx));
    if (action === "coil-replace") return NextResponse.json(getCoilReplacementProcedure(ctx));

    const section = resolveManualSection(body.message || "") || "controls";
    return NextResponse.json(getManualHelp(ctx, section));
  } catch (err) {
    console.error("[ava/device-support]", err);
    return NextResponse.json({
      allowed: false,
      reason: "DEVICE_NOT_CONFIRMED",
      requiredAction: "SHOW_DEVICE_CONFIRMATION",
    });
  }
}
