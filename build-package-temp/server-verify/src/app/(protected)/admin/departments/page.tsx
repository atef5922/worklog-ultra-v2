import { DepartmentsManager } from "@/components/admin/departments-manager";
import { canManageDepartments } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { getDepartments } from "@/lib/worklog";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminDepartmentsPage() {
  const user = await requireUser();

  if (!canManageDepartments(user)) {
    redirect("/dashboard");
  }

  const [departments, users] = await Promise.all([
    getDepartments(),
    db.user.findMany({
      where: { isActive: true },
      select: {
        departmentId: true,
        role: true,
      },
    }),
  ]);

  return (
    <DepartmentsManager
      departments={departments.map((department) => {
        const departmentUsers = users.filter((user) => user.departmentId === department.id);

        return {
          id: department.id,
          name: department.name,
          memberCount: departmentUsers.length,
          teamHeadCount: departmentUsers.filter((user) => user.role === "manager").length,
        };
      })}
    />
  );
}
