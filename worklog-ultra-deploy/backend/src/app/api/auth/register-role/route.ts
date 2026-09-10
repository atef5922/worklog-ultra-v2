import { addMinutes } from "date-fns";
import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api";
import { getRoleAccessCode, roleNeedsAccessCode, roleNeedsDepartment } from "@/lib/auth/access";
import { isMailConfigured, sendOtpEmail } from "@/lib/auth/mail";
import { createOtpCode, hashOtp } from "@/lib/auth/otp";
import { ROLE_RANK } from "@/lib/auth/roles";
import { hashPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { registerRoleSchema } from "@/lib/validators/auth";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = registerRoleSchema.safeParse(body);

  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid signup request.");
  }

  const payload = parsed.data;

  if (roleNeedsDepartment(payload.role) && !payload.departmentId) {
    return apiError("Department is required for this role.");
  }

  if (roleNeedsAccessCode(payload.role)) {
    const expected = getRoleAccessCode(payload.role);

    if (!expected || expected !== payload.accessCode) {
      return apiError("Access code is invalid for the selected role.");
    }
  }

  const existingUser = await db.user.findUnique({ where: { email: payload.email } });

  if (existingUser) {
    if (ROLE_RANK[payload.role] === ROLE_RANK[existingUser.role]) {
      return apiError("Already registered, please login.");
    }

    if (ROLE_RANK[payload.role] < ROLE_RANK[existingUser.role]) {
      return apiError("A higher privilege account already exists for this email.");
    }
  }

  const otpSecret = process.env.AUTH_SIGNUP_OTP_SECRET;

  if (!otpSecret) {
    return apiError("AUTH_SIGNUP_OTP_SECRET is not configured.", 500);
  }

  const code = createOtpCode();
  const codeHash = hashOtp(otpSecret, payload.email, payload.role, code);
  const passwordHash = await hashPassword(payload.password);

  await db.signupVerificationCode.create({
    data: {
      email: payload.email,
      role: payload.role,
      name: payload.name,
      departmentId: payload.departmentId ?? null,
      designation: payload.designation || null,
      passwordHash,
      codeHash,
      expiresAt: addMinutes(new Date(), 10),
    },
  });

  const showOtp =
    process.env.NODE_ENV !== "production" &&
    process.env.AUTH_SIGNUP_SHOW_OTP_ON_SCREEN === "true";
  const mailConfigured = isMailConfigured();

  if (!mailConfigured && !showOtp) {
    return apiError("Email delivery is not configured yet. Add Resend credentials or enable dev OTP display.", 500);
  }

  if (mailConfigured) {
    const delivered = await sendOtpEmail({
      email: payload.email,
      code,
      title: existingUser ? "Confirm your role upgrade" : "Verify your WorkLog signup",
    });

    if (!delivered) {
      return apiError("Verification email could not be sent. Please check mail configuration.", 500);
    }
  }

  return apiSuccess(
    {
      message: existingUser
        ? "Verification code sent. Complete the upgrade to activate the new role."
        : "Verification code sent. Enter the 6 digit code to complete signup.",
      otp: showOtp ? code : undefined,
    },
    201,
  );
}
