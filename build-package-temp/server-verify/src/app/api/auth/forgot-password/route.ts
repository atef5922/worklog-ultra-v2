import { addMinutes } from "date-fns";
import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api";
import { isMailConfigured, sendPasswordResetEmail } from "@/lib/auth/mail";
import { createOtpCode, hashToken } from "@/lib/auth/otp";
import { db } from "@/lib/db";
import { forgotPasswordSchema } from "@/lib/validators/auth";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = forgotPasswordSchema.safeParse(body);

  if (!parsed.success) {
    return apiSuccess({ message: "If the account exists, a reset instruction has been sent." });
  }

  const user = await db.user.findUnique({ where: { email: parsed.data.email } });

  if (!user) {
    return apiSuccess({ message: "If the account exists, a reset instruction has been sent." });
  }

  const secret = process.env.AUTH_SIGNUP_OTP_SECRET ?? "fallback-reset-secret";
  const code = createOtpCode();
  const tokenHash = hashToken(secret, user.email, code);

  await db.passwordResetToken.create({
    data: {
      email: user.email,
      userId: user.id,
      tokenHash,
      expiresAt: addMinutes(new Date(), 30),
    },
  });

  const mailConfigured = isMailConfigured();
  const showDebugCode =
    process.env.NODE_ENV !== "production" &&
    process.env.AUTH_SIGNUP_SHOW_OTP_ON_SCREEN === "true";

  if (!mailConfigured && !showDebugCode) {
    return apiError("Password reset email is not configured yet.", 500);
  }

  if (mailConfigured) {
    const delivered = await sendPasswordResetEmail({
      email: user.email,
      code,
    });

    if (!delivered) {
      return apiError("Password reset email could not be sent. Please check mail configuration.", 500);
    }
  }

  return apiSuccess({
    message: "If the account exists, a 6 digit reset code has been sent.",
    code: showDebugCode ? code : undefined,
    email: user.email,
  });
}
