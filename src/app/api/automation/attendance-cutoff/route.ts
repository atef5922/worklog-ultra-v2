import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api";
import { getServerAuthContext } from "@/lib/auth/server";
import { autoCloseAllAttendance } from "@/lib/attendance-cutoff";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("x-worklog-cron-key");
  const cronKey = process.env.AUTH_SECRET;
  const context = await getServerAuthContext();
  const isPrivilegedUser = context.user?.role === "super_admin";
  const hasCronAccess = Boolean(cronKey && authHeader === cronKey);

  if (!isPrivilegedUser && !hasCronAccess) {
    return apiError("Unauthorized attendance cutoff run.", 403);
  }

  const result = await autoCloseAllAttendance();
  return apiSuccess({
    message: result.closedRecords
      ? `Auto-closed ${result.closedRecords} attendance record(s) at their confirmed safety cutoff.`
      : "No attendance records needed the safety cutoff.",
    ...result,
  });
}
