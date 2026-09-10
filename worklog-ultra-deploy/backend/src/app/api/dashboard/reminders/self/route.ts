import { ReminderKind } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api";
import { sendWorkspaceEmail } from "@/lib/auth/mail";
import { requireUser } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { markReminderSent } from "@/lib/worklog";
import { toDateOnly } from "@/lib/utils";

export async function POST() {
  const user = await requireUser();
  const today = toDateOnly();
  const now = new Date();

  const existing = await db.reminderDispatch.findUnique({
    where: {
      userId_reminderDate_kind: {
        userId: user.id,
        reminderDate: new Date(today),
        kind: ReminderKind.report_evening,
      },
    },
  });

  if (existing) {
    return apiSuccess({ message: "Pending reminder already sent for today." });
  }

  const taskCount = await db.dailyTask.count({
    where: {
      userId: user.id,
      planDate: new Date(today),
      updates: {
        none: {
          reportDate: new Date(today),
          status: "done",
        },
      },
    },
  });

  if (!taskCount) {
    return apiSuccess({ message: "No pending task reminder needed." });
  }

  const delivered = await sendWorkspaceEmail({
    email: user.email,
    subject: "Pending task reminder",
    html: `<div style="font-family:Arial,sans-serif;color:#0f1725"><h2>Hello ${user.name},</h2><p>You still have pending work scheduled for today.</p><p>Please open WorkLog and complete or update your tasks.</p><p><strong>Reminder time:</strong> ${now.toLocaleString("en-BD", { timeZone: "Asia/Dhaka" })}</p></div>`,
  });

  if (!delivered) {
    return apiError("Reminder email could not be sent right now.");
  }

  await markReminderSent(user.id, today, ReminderKind.report_evening);
  return apiSuccess({ message: "Pending reminder email sent." });
}
