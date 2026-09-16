import { z } from "zod";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { can, canViewAttendanceDetails, employeeScope, isSuperAdmin } from "@/lib/auth/policy";
import { AccessError, audit, authenticate, checkDashboardActionOrigin, fail, freshActor } from "@/lib/management/server";

const schema = z.object({
  date: z.iso.date(),
  subjectType: z.enum(["company", "department", "employee"]),
  subjectId: z.string().uuid().nullable(),
  kind: z.enum(["off", "leave", "workday", "clear"]),
  reason: z.string().trim().min(10).max(500),
}).strict();

export async function POST(request: Request) {
  try {
    checkDashboardActionOrigin(request);
    const actor = await authenticate("attendance.correct");
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AccessError("Enter a valid date, subject, day type and reason of at least 10 characters.", 400);
    const { date, subjectType, subjectId, kind, reason } = parsed.data;
    if ((subjectType === "company") !== (subjectId === null)) throw new AccessError("Choose a valid attendance subject.", 400);
    if (kind === "leave" && subjectType !== "employee") throw new AccessError("Leave must be assigned to an employee.", 400);
    const attendanceDate = new Date(date);
    const subjectKey = subjectType === "company" ? "company" : `${subjectType}:${subjectId}`;
    await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id::text FROM users WHERE id=${actor.id}::uuid FOR UPDATE`;
      const current = await freshActor(tx, actor.id);
      if (!can(current, "attendance.correct") || !canViewAttendanceDetails(current)) throw new AccessError("Management attendance access has changed.");
      if (subjectType !== "employee" && !isSuperAdmin(current)) throw new AccessError("Only Super Admin can set company or department days.");
      if (subjectType === "department" && !await tx.department.findUnique({ where: { id: subjectId! }, select: { id: true } })) {
        throw new AccessError("Department not found.", 404);
      }
      if (subjectType === "employee") {
        const target = await tx.user.findFirst({
          where: { AND: [
            { id: subjectId!, isActive: true },
            employeeScope(current, "attendance.correct"),
            employeeScope(current, "attendance.view"),
            employeeScope(current, "employees.view"),
          ] },
          select: { id: true },
        });
        if (!target) throw new AccessError("Employee is outside your permitted scope.", 404);
        if (target.id === current.id && !isSuperAdmin(current)) throw new AccessError("Your own attendance requires another authorized reviewer.");
      }
      const key = { attendanceDate, subjectKey };
      const before = await tx.attendanceDayOverride.findUnique({ where: { attendanceDate_subjectKey: key } });
      let after = null;
      if (kind === "clear") {
        if (!before) throw new AccessError("No dated exception exists for this subject.", 404);
        await tx.attendanceDayOverride.delete({ where: { attendanceDate_subjectKey: key } });
      } else {
        after = await tx.attendanceDayOverride.upsert({
          where: { attendanceDate_subjectKey: key },
          create: {
            attendanceDate, subjectKey, kind, reason,
            departmentId: subjectType === "department" ? subjectId : null,
            employeeId: subjectType === "employee" ? subjectId : null,
            createdBy: current.id,
          },
          update: { kind, reason },
        });
      }
      await audit(tx, current.id, subjectType === "employee" ? subjectId : null,
        "attendance.day_override_updated", before, after, reason);
    }, { isolationLevel: "Serializable" });
    return NextResponse.json({ message: kind === "clear" ? "Dated attendance exception removed." : "Dated attendance setting saved." });
  } catch (error) {
    return fail(error);
  }
}
