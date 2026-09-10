import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api";
import { getRoleAccessCode, roleNeedsAccessCode } from "@/lib/auth/access";
import { verifyPassword } from "@/lib/auth/password";
import { createUserSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { loginSchema } from "@/lib/validators/auth";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid login request.");
  }

  const payload = parsed.data;

  if (roleNeedsAccessCode(payload.role)) {
    const expected = getRoleAccessCode(payload.role);
    if (!expected || expected !== payload.accessCode) {
      return apiError("Access code is invalid for the selected role.");
    }
  }

  const user = await db.user.findUnique({ where: { email: payload.email } });

  if (!user) {
    return apiError("No account found with this email.");
  }

  if (!user.isActive) {
    return apiError("This account is currently deactivated. Please contact your Team Head or CEO/Admin.");
  }

  if (user.role !== payload.role) {
    return apiError("Please login using your registered role.");
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
}
