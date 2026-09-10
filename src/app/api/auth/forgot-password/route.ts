import { addMinutes } from "date-fns";
import { NextRequest } from "next/server";
import { apiSuccess } from "@/lib/api";
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

  return apiSuccess({
    message: "Use the code shown below to reset your password.",
    email: user.email,
    code,
  });
}
