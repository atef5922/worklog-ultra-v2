import { getServerAuthContext } from "@/lib/auth/server";
import { clearUserSession } from "@/lib/auth/session";

export async function POST() {
  const context = await getServerAuthContext();
  await clearUserSession(context.sessionId);
  // A relative Location preserves the LAN hostname used by the browser. Building
  // this from request.url could incorrectly send another PC to localhost.
  return new Response(null, {
    status: 303,
    headers: { Location: "/auth/login", "Cache-Control": "no-store" },
  });
}
