import { NextRequest } from "next/server";
import { z } from "zod";
import { registerUser } from "@/lib/auth";
import { jsonResponse, handleApiError } from "@/lib/api-utils";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = registerSchema.parse(body);
    const result = await registerUser(data);
    return jsonResponse(result, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
