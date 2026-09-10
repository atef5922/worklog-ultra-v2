import { NextRequest } from "next/server";
import { ReminderKind } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api";
import { getServerAuthContext } from "@/lib/auth/server";
import { sendWorkspaceEmail } from "@/lib/auth/mail";
import { getReminderCandidates, markReminderSent } from "@/lib/worklog";

function buildReminder(kind: ReminderKind, name: string) {
  if (kind === ReminderKind.attendance_morning) {
    return {
      subject: "Attendance reminder for today",
      html: `<div style="font-family:Arial,sans-serif;color:#0f1725"><h2>Hello ${name},</h2><p>You have not marked attendance yet today. Please check in from the Attendance panel.</p></div>`,
    };
  }

  if (kind === ReminderKind.plan_morning) {
    return {
      subject: "Morning plan reminder",
      html: `<div style="font-family:Arial,sans-serif;color:#0f1725"><h2>Hello ${name},</h2><p>Your morning work plan has not been submitted yet. Please add today's plan from the dashboard.</p></div>`,
    };
  }

  return {
    subject: "Evening report reminder",
    html: `<div style="font-family:Arial,sans-serif;color:#0f1725"><h2>Hello ${name},</h2><p>Your evening report is still pending. Please complete your report before the day closes.</p></div>`,
  };
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("x-worklog-cron-key");
  const cronKey = process.env.AUTH_SECRET;
  const body = await request.json().catch(() => ({}));
  const kind = body.kind as ReminderKind | undefined;

  const context = await getServerAuthContext();
  const isPrivilegedUser = context.user?.role === "manager" || context.user?.role === "admin";
  const hasCronAccess = Boolean(cronKey && authHeader === cronKey);

  if (!isPrivilegedUser && !hasCronAccess) {
    return apiError("Unauthorized reminder run.", 403);
  }

  if (kind && !Object.values(ReminderKind).includes(kind)) {
    return apiError("Invalid reminder kind.", 400);
  }

  const candidates = await getReminderCandidates();
  let sent = 0;

  for (const candidate of candidates) {
    const queue: ReminderKind[] = [];

    if (!kind || kind === ReminderKind.attendance_morning) {
      if (candidate.canSendAttendance) queue.push(ReminderKind.attendance_morning);
    }
    if (!kind || kind === ReminderKind.plan_morning) {
      if (candidate.canSendPlan) queue.push(ReminderKind.plan_morning);
    }
    if (!kind || kind === ReminderKind.report_evening) {
      if (candidate.canSendReport) queue.push(ReminderKind.report_evening);
    }

    for (const kind of queue) {
      const emailPayload = buildReminder(kind, candidate.user.name);
      const delivered = await sendWorkspaceEmail({
        email: candidate.user.email,
        subject: emailPayload.subject,
        html: emailPayload.html,
      });

      if (delivered) {
        await markReminderSent(candidate.user.id, candidate.day, kind);
        sent += 1;
      }
    }
  }

  return apiSuccess({
    message: sent ? `Reminder automation sent ${sent} email(s).` : "No reminder emails were needed.",
    sent,
  });
}
