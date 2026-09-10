import { DepartmentsManager } from "@/components/admin/departments-manager";
import { requireAdminOrManager } from "@/lib/auth/server";
import { getDepartments } from "@/lib/worklog";

export const dynamic = "force-dynamic";

export default async function AdminDepartmentsPage() {
  await requireAdminOrManager();
  const departments = await getDepartments();

  return <DepartmentsManager departments={departments} />;
}
