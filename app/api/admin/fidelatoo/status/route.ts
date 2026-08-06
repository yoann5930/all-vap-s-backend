import type { NextRequest } from "next/server";
import { handleStatusGet } from "@/lib/fidelatoo/route-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return handleStatusGet(request);
}
