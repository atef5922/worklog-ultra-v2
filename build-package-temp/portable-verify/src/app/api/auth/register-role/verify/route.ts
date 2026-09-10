import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api";
import { hashOtp } from "@/lib/auth/otp";
import { ROLE_RANK } from "@/lib/auth/roles";
import { createUserSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { verifyRegistrationSchema } from "@/lib/validators/auth";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = verifyRegistrationSchema.safeParse(body);

  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid verification request.");
  }

  const otpSecret = process.env.AUTH_SIGNUP_OTP_SECRET;

  if (!otpSecret) {
    return apiError("AUTH_SIGNUP_OTP_SECRET is not configured.", 500);
  }

  const { email, role, code } = parsed.data;
  const verification = await db.signupVerificationCode.findFirst({
    where: {
      email,
      role,
      verifiedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!verification) {
    return apiError("No active verification request found.");
  }

  if (verification.expiresAt < new Date()) {
    return apiError("Verification code expired. Please request a new code.");
  }

  const submittedHash = hashOtp(otpSecret, email, role, code);

  if (submittedHash !== verification.codeHash) {
    await db.signupVerificationCode.update({
      where: { id: verification.id },
      data: { attempts: { increment: 1 } },
    });
    return apiError("Verification code is incorrect.");
  }

  const existingUser = await db.user.findUnique({ where: { email } });
  let user;

  if (existingUser) {
    if (ROLE_RANK[role] <= ROLE_RANK[existingUser.role]) {
      return apiError("This account already has the same or higher role.");
    }

    user = await db.user.update({
      where: { id: existingUser.id },
      data: {
        role,
        name: verification.name,
        passwordHash: verification.passwordHash,
        designation: verification.designation,
        departmentId: verification.departmentId,
      },
    });
  } else {
    user = await db.user.create({
      data: {
        email,
        role,
        name: verification.name,
        passwordHash: verification.passwordHash,
        designation: verification.designation,
        departmentId: verification.departmentId,
      },
    });
  }

  await db.signupVerificationCode.update({
    where: { id: verification.id },
    data: { verifiedAt: new Date() },
  });

  const sessionId = crypto.randomUUID();
  await createUserSession({
    sessionId,
    userId: user.id,
    role: user.role,
    email: user.email,
  });

  return apiSuccess({ message: "Account verified successfully.", user: { role: user.role } });
}
