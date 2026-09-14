import { AssignmentsCenter } from "@/components/dashboard/assignments-center";
import { requireUser } from "@/lib/auth/server";
import { getAssignableUsers, getAssignmentsData, getDepartments, getCurrentUserAttendanceSnapshot } from "@/lib/worklog";

export const dynamic = "force-dynamic";

export default async function AssignmentsPage() {
  const user = await requireUser();
  const [departments, assignableUsers, assignments, attendance] = await Promise.all([
    getDepartments(),
    getAssignableUsers(),
    getAssignmentsData(user.id),
    getCurrentUserAttendanceSnapshot(user.id),
  ]);

  return (
    <AssignmentsCenter
      attendanceRunning={Boolean(attendance?.workSessions.some(session => !session.endedAt))}
      assignedByMe={assignments.assignedByMe ?? []}
      assignedToMe={assignments.assignedToMe ?? []}
      assignableUsers={assignableUsers ?? []}
      currentUserId={user.id}
      departments={departments ?? []}
    />
  );
}
