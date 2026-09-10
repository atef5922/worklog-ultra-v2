import { Resend } from "resend";

function getDhakaMailStamp() {
  return new Intl.DateTimeFormat("en-BD", {
    timeZone: "Asia/Dhaka",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date());
}

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return null;
  }

  return new Resend(apiKey);
}

export function isMailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}

async function sendEmail({
  email,
  subject,
  html,
  text,
}: {
  email: string;
  subject: string;
  html: string;
  text?: string;
}) {
  const resend = getResendClient();
  const from = process.env.RESEND_FROM_EMAIL;

  if (!resend || !from) {
    return false;
  }

  const result = await resend.emails.send({
    from,
    to: email,
    subject,
    html,
    text,
  });

  if (!result || result.error) {
    console.error("Resend delivery failed", result?.error ?? "Unknown mail error");
    return false;
  }

  return true;
}

export async function sendOtpEmail({
  email,
  code,
  title,
}: {
  email: string;
  code: string;
  title: string;
}) {
  return sendEmail({
    email,
    subject: `${title} - ${getDhakaMailStamp()}`,
    html: `<div style="font-family:Arial,sans-serif;color:#0f1725;line-height:1.6">
      <h2 style="margin:0 0 12px">Verify your WorkLog access</h2>
      <p style="margin:0 0 12px">Your verification code is:</p>
      <div style="display:inline-block;padding:12px 18px;border-radius:14px;background:#102f5c;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:0.22em">${code}</div>
      <p style="margin:16px 0 0"><strong>Requested at:</strong> ${getDhakaMailStamp()} (BD time)</p>
      <p style="margin:16px 0 0">This code expires in 10 minutes.</p>
    </div>`,
    text: `Verify your WorkLog access\n\nYour verification code is: ${code}\nRequested at: ${getDhakaMailStamp()} (BD time)\n\nThis code expires in 10 minutes.`,
  });
}

export async function sendWorkspaceEmail({
  email,
  subject,
  html,
  text,
}: {
  email: string;
  subject: string;
  html: string;
  text?: string;
}) {
  return sendEmail({ email, subject, html, text });
}

export async function sendPasswordResetEmail({
  email,
  code,
}: {
  email: string;
  code: string;
}) {
  return sendEmail({
    email,
    subject: `Your WorkLog password reset code - ${getDhakaMailStamp()}`,
    html: `<div style="font-family:Arial,sans-serif;color:#0f1725;line-height:1.6">
      <h2 style="margin:0 0 12px">Reset your password</h2>
      <p style="margin:0 0 12px">We received a request to reset your WorkLog password. Use the code below to continue.</p>
      <div style="display:inline-block;padding:12px 18px;border-radius:14px;background:#102f5c;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:0.22em">${code}</div>
      <p style="margin:16px 0 12px"><strong>Requested at:</strong> ${getDhakaMailStamp()} (BD time)</p>
      <p style="margin:16px 0 12px">This secure code expires in 30 minutes.</p>
      <p style="margin:0">If you did not request this, you can safely ignore this email.</p>
    </div>`,
    text: `Reset your WorkLog password\n\nUse this 6 digit code: ${code}\nRequested at: ${getDhakaMailStamp()} (BD time)\n\nThis code expires in 30 minutes.\n\nIf you did not request this, you can ignore this email.`,
  });
}
