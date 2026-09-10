import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api";
import { requireAdminOrManager } from "@/lib/auth/server";
import { db } from "@/lib/db";

export async function POST(request: NextRequest) {
  await requireAdminOrManager();
  const body = await request.json();
  const name = String(body.name ?? "").trim();

  if (name.length < 2) {
    return apiError("Department name must be at least 2 characters.");
  }

  const existing = await db.department.findFirst({
    where: {
      name: {
        equals: name,
        mode: "insensitive",
      },
    },
  });

  if (existing) {
    return apiError("This department already exists.");
  }

  const department = await db.department.create({
    data: { name },
  });

  return apiSuccess({
    message: "Department added successfully.",
    department,
  });
}

export async function DELETE(request: NextRequest) {
  await requireAdminOrManager();

  const body = await request.json().catch(() => ({}));
  const departmentId = String(body.id ?? "").trim();

  if (!departmentId) {
    return apiError("Department id is required.");
  }

  const department = await db.department.findUnique({
    where: { id: departmentId },
    select: {
      id: true,
      name: true,
      _count: {
        select: {
          users: true,
          tasks: true,
          notices: true,
          signups: true,
        },
      },
    },
  });

  if (!department) {
    return apiError("Department not found.", 404);
  }

  const linkedRecords =
    department._count.users +
    department._count.tasks +
    department._count.notices +
    department._count.signups;

  if (linkedRecords > 0) {
    return apiError(
      "This department cannot be deleted yet. Remove or move its users, tasks, notices, and pending signups first.",
      400,
    );
  }

  await db.department.delete({
    where: { id: department.id },
  });

  return apiSuccess({
    message: "Department deleted successfully.",
  });
}
