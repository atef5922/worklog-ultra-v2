import { apiSuccess } from "@/lib/api";
import { requireUser } from "@/lib/auth/server";

export async function GET() {
  await requireUser();
  return apiSuccess({ notifications: [] });
}
