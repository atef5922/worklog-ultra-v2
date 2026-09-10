import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api";
import { hashToken } from "@/lib/auth/otp";
import { hashPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { resetPasswordSchema } from "@/lib/validators/auth";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = resetPasswordSchema.safeParse(body);

  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid reset request.");
  }

  const { email, code, password } = parsed.data;
  const secret = process.env.AUTH_SIGNUP_OTP_SECRET ?? "fallback-reset-secret";
  const tokenHash = hashToken(secret, email, code);

  const resetToken = await db.passwordResetToken.findFirst({
    where: {
      email,
      tokenHash,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!resetToken) {
    return apiError("Reset code is invalid or expired.");
  }

  const passwordHash = await hashPassword(password);

  await db.$transaction([
    db.user.update({
      where: { email },
      data: { passwordHash },
    }),
    db.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    }),
  ]);

  return apiSuccess({ message: "Password updated successfully. You can now login." });
}
