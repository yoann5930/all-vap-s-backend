import { NextRequest, NextResponse } from "next/server";
import { identifyDeviceFromText, buildConfirmedContext } from "@/lib/ava/device-identification";
import { findDeviceBySlug, searchDevices } from "@/lib/ava/device-support";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      query?: string;
      confirmSlug?: string;
      method?: "CLIENT_SELECTED_IMAGE" | "CLIENT_UPLOADED_PHOTO" | "EXACT_TEXT_AND_IMAGE_CONFIRMATION";
      cartridge?: string;
    };

    if (body.confirmSlug) {
      const device = findDeviceBySlug(body.confirmSlug);
      if (!device) {
        return NextResponse.json({
          allowed: false,
          reason: "DEVICE_NOT_CONFIRMED",
          requiredAction: "SHOW_DEVICE_CONFIRMATION",
        });
      }
      const ctx = buildConfirmedContext(
        device,
        body.method || "CLIENT_SELECTED_IMAGE",
        body.cartridge
      );
      return NextResponse.json({ allowed: true, context: ctx, device });
    }

    const query = (body.query || "").trim();
    const id = identifyDeviceFromText(query);
    return NextResponse.json({
      ...id,
      candidates: id.candidates.map((c) => ({
        manufacturer: c.manufacturer,
        model: c.model,
        modelSlug: `${c.manufacturerSlug}-${c.modelSlug}`,
        imageUrl: c.images.front ?? null,
        distinguishingFeatures: c.distinguishingFeatures ?? [],
        verificationStatus: c.verificationStatus,
      })),
      search: searchDevices(query, 3).map((d) => d.model),
    });
  } catch (err) {
    console.error("[ava/device-identify]", err);
    return NextResponse.json({ error: "Identification impossible" }, { status: 500 });
  }
}
