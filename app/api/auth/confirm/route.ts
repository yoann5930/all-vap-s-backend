import { NextRequest } from "next/server";
import { z } from "zod";
import { confirmUserEmail } from "@/lib/auth";
import { jsonResponse, handleApiError } from "@/lib/api-utils";

const schema = z.object({
  token: z.string().min(10),
});

/** Confirme l’email via le token reçu par mail. */
export async function POST(request: NextRequest) {
  try {
    const { token } = schema.parse(await request.json());
    const user = await confirmUserEmail(token);
    return jsonResponse({
      message: "Compte confirmé avec succès.",
      user,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Lien direct depuis l’email (GET ?token=). */
export async function GET(request: NextRequest) {
  try {
    const token = new URL(request.url).searchParams.get("token");
    if (!token) throw new Error("INVALID_TOKEN");
    const user = await confirmUserEmail(token);
    return jsonResponse({
      message: "Compte confirmé avec succès.",
      user,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
