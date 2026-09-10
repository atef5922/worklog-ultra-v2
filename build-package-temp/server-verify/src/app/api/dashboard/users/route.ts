import { apiSuccess } from "@/lib/api";
import { requireUser } from "@/lib/auth/server";
import { db } from "@/lib/db";

export async function GET() {
  await requireUser();

  const users = await db.user.findMany({
    where: {
      isActive: true,
    },
    include: {
      department: true,
    },
    orderBy: [{ department: { name: "asc" } }, { name: "asc" }],
  });

  return apiSuccess({
    users: users.map((user) => ({
      id: user.id,
      name: user.name,
      role: user.role,
      designation: user.designation,
      departmentId: user.departmentId,
      departmentName: user.department?.name ?? "No department",
    })),
  });
}
