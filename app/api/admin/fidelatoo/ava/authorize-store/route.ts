import { NextRequest } from "next/server";
import { handleApiError } from "@/lib/api-utils";
import { handleCommandPost } from "@/lib/fidelatoo/route-helpers";
import { authorizeStoreSchema } from "@/lib/fidelatoo/schemas";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = authorizeStoreSchema.parse(await request.json());
    return handleCommandPost(request, "ava.authorize_store", {
      store: body.store,
      allow: body.allow,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
