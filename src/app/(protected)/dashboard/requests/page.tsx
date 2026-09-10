import { redirect } from "next/navigation";
import { requireEmployee } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; taskId?: string; requestId?: string }>;
}) {
  await requireEmployee();
  void searchParams;
  redirect("/dashboard/history");
}
