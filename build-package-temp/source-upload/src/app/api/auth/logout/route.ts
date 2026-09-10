import { apiSuccess } from "@/lib/api";
import { getServerAuthContext } from "@/lib/auth/server";
import { clearUserSession } from "@/lib/auth/session";

export async function POST() {
  const context = await getServerAuthContext();
  await clearUserSession(context.sessionId);
  return apiSuccess({ message: "Logged out successfully." });
}
