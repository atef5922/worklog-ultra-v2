import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api";
import { requireUser } from "@/lib/auth/server";
import { roleNeedsDepartment } from "@/lib/auth/access";
import { db } from "@/lib/db";
import { updateProfileSchema } from "@/lib/validators/profile";

export async function POST(request: NextRequest) {
  const user = await requireUser();
  const body = await request.json();
  const parsed = updateProfileSchema.safeParse(body);

  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid profile update.");
  }

  const payload = parsed.data;
  const departmentId = payload.departmentId || null;
  const nextAvatarUrl =
    typeof payload.avatarUrl === "string" && payload.avatarUrl.trim().startsWith("/uploads/avatars/")
      ? payload.avatarUrl.trim()
      : user.avatarUrl;

  if (roleNeedsDepartment(user.role) && !departmentId) {
    return apiError("Department is required for this account.");
  }

  const canManageCompensation = user.role === "manager" || user.role === "admin";

  const updatedUser = await db.user.update({
    where: { id: user.id },
    data: {
      name: payload.name,
      designation: payload.designation || null,
      phone: payload.phone || null,
      location: payload.location || null,
      avatarUrl: nextAvatarUrl,
      expectedDailyHours:
        canManageCompensation && typeof payload.expectedDailyHours === "number" ? payload.expectedDailyHours : undefined,
      monthlySalary: canManageCompensation && typeof payload.monthlySalary === "number" ? payload.monthlySalary : undefined,
      departmentId,
    },
    include: {
      department: true,
    },
  });

  if (process.env.NODE_ENV !== "production") {
    console.log("[profile] saved avatar URL:", updatedUser.avatarUrl);
  }

  return apiSuccess({
    message: "Profile updated successfully.",
    user: {
      name: updatedUser.name,
      avatarUrl: updatedUser.avatarUrl,
      designation: updatedUser.designation,
      department: updatedUser.department?.name ?? null,
    },
  });
}
