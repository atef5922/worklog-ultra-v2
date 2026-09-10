import { DirectoryCenter } from "@/components/dashboard/directory-center";
import { canAccessWorkMonitor, shouldScopePrivilegedViewsToDepartment } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/server";
import { getWorkspaceDirectoryData } from "@/lib/worklog";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DirectoryPage({
  searchParams,
}: {
  searchParams?: Promise<{ departmentId?: string; userId?: string }>;
}) {
  const user = await requireUser();
  const params = searchParams ? await searchParams : undefined;

  if (!canAccessWorkMonitor(user)) {
    redirect("/dashboard");
  }

  const data = await getWorkspaceDirectoryData({
    role: user.role,
    departmentId: user.departmentId,
    scopeToDepartment: shouldScopePrivilegedViewsToDepartment(user),
  });

  return (
    <DirectoryCenter
      canSwitchDepartment={user.role === "admin"}
      departments={data.departments}
      initialDepartmentId={user.role === "admin" && !shouldScopePrivilegedViewsToDepartment(user) ? params?.departmentId : data.departments[0]?.id}
      initialUserId={params?.userId}
      users={data.users}
    />
  );
}
