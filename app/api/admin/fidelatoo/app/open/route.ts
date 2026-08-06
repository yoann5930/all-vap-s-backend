import type { NextRequest } from "next/server";
import { handleCommandPost } from "@/lib/fidelatoo/route-helpers";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return handleCommandPost(request, "app.open");
}
