import { ClipboardList } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { PlanForm } from "@/components/dashboard/plan-form";
import { requireEmployee } from "@/lib/auth/server";
import { getAssignableUsers, getDepartments, getPlanSuggestions } from "@/lib/worklog";
import { isTenderDepartmentName } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PlanPage() {
  const user = await requireEmployee();
  const isTenderDepartment = isTenderDepartmentName(user.department?.name);
  const [departments, suggestions, assignableUsers] = await Promise.all([
    getDepartments(),
    getPlanSuggestions(user.id, user.departmentId),
    getAssignableUsers(),
  ]);

  return (
    /* One screen. `fitViewport` tells PlanForm to fill the leftover height and
       keep only its task list scrollable — the modal renders the same form
       without it, where the content must flow at its natural height. */
    <div
      className="flex flex-col gap-2 min-[900px]:min-h-0 min-[900px]:flex-1 min-[900px]:overflow-hidden"
      data-fit-viewport
    >
      <PageHeader
        icon={ClipboardList}
        subtitle="Build today's task list with department-aware entries and clear priorities."
        title="Today's Task"
      />
      <PlanForm
        assignableUsers={assignableUsers ?? []}
        currentUserId={user.id}
        departments={departments ?? []}
        fitViewport
        initialTasks={[]}
        isTenderDepartment={isTenderDepartment}
        suggestions={suggestions ?? []}
        userDepartmentId={user.departmentId}
        role={user.role}
      />
    </div>
  );
}
