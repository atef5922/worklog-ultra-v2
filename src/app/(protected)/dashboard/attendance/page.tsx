import { AttendancePanel } from "@/components/dashboard/attendance-panel";
import { requireAttendancePageAccess } from "@/lib/auth/server";
import { getAttendanceData } from "@/lib/worklog";

export const dynamic = "force-dynamic";

export default async function AttendancePage() {
  const user = await requireAttendancePageAccess();
  const items = await getAttendanceData(user);

  return <AttendancePanel currentUserId={user.id} items={items ?? []} userRole={user.role} />;
}
