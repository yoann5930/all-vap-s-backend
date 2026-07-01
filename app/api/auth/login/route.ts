import { NextRequest } from "next/server";
import { z } from "zod";
import { loginUser } from "@/lib/auth";
import { jsonResponse, handleApiError } from "@/lib/api-utils";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = loginSchema.parse(body);
    const result = await loginUser(data.email, data.password);
    return jsonResponse(result);
  } catch (error) {
    return handleApiError(error);
  }
}
