import { NextRequest } from "next/server";
import { requireStaff } from "@/lib/jwt";
import { handleApiError } from "@/lib/api-utils";
import { readOrderDocumentBytes } from "@/lib/documents/service";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireStaff();
    const { id } = await context.params;
    const { bytes, fileName, mimeType } = await readOrderDocumentBytes(id);
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
