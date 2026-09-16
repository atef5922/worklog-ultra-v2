import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { canViewAttendanceDetails } from "@/lib/auth/policy";

export default async function OldAttendancePage() {
  const user = await requireUser();
  redirect(canViewAttendanceDetails(user) ? "/management/attendance" : "/dashboard");
}
