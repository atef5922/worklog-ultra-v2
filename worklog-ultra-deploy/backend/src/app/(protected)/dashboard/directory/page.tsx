import { DirectoryCenter } from "@/components/dashboard/directory-center";
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

  if (user.role !== "manager" && user.role !== "admin") {
    redirect("/dashboard");
  }

  const data = await getWorkspaceDirectoryData({
    role: user.role,
    departmentId: user.departmentId,
  });

  return (
    <DirectoryCenter
      canSwitchDepartment={user.role === "admin"}
      departments={data.departments}
      initialDepartmentId={user.role === "admin" ? params?.departmentId : data.departments[0]?.id}
      initialUserId={params?.userId}
      users={data.users}
    />
  );
}
