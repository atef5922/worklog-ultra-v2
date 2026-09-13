import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api";
import { verifyPassword } from "@/lib/auth/password";
import { createUserSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { loginSchema } from "@/lib/validators/auth";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid login request.");
  }
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid login request.");
  }

  const payload = parsed.data;

  try {
    // Login must not depend on unrelated profile/management columns.
    const user = await db.user.findUnique({
      where: { email: payload.email },
      select: { id: true, email: true, passwordHash: true, isActive: true, role: true },
    });

    if (!user) {
      return apiError("No account found with this email.");
    }

    if (!user.isActive) {
      return apiError("This account is currently deactivated. Please contact your administrator.");
    }

    const passwordMatches = await verifyPassword(payload.password, user.passwordHash);

    if (!passwordMatches) {
      return apiError("Incorrect password.");
    }

    const sessionId = crypto.randomUUID();
    await createUserSession({
      sessionId,
      userId: user.id,
      role: user.role,
      email: user.email,
      rememberMe: payload.remember,
    });

    return apiSuccess({ message: "Login successful.", user: { role: user.role } });
  } catch (error) {
    // Do not expose connection details, query parameters, or credentials.
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "UNKNOWN";
    console.error("[auth/login] Sign-in unavailable", /^[A-Z0-9_]{1,20}$/.test(code) ? code : "UNKNOWN");
    return apiError("Sign-in is temporarily unavailable. Please try again shortly or contact your administrator.", 503);
  }
}
