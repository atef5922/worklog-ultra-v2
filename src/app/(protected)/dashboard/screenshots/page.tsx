import { redirect } from "next/navigation";
import { ScreenshotGallery } from "@/components/dashboard/screenshot-gallery";
import { canAccessScreenshotGallery } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ScreenshotsPage() {
  const user = await requireUser();

  if (!canAccessScreenshotGallery(user)) {
    redirect("/dashboard");
  }

  const isAdmin = user.role === "admin";

  // Same boundary as the API's own scope check (see resolveScreenshotScope):
  // a Team Head only ever sees their own department here, so the dropdown
  // never advertises an employee the gallery API would then reject.
  const [departments, employees] = await Promise.all([
    isAdmin ? db.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }) : Promise.resolve([]),
    db.user.findMany({
      where: {
        isActive: true,
        ...(isAdmin ? {} : { departmentId: user.departmentId }),
      },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        departmentId: true,
        // Latest heartbeat only — this is what lets the gallery show "agent
        // online/last seen" without a second client-side fetch. The desktop
        // agent pings this independently of captures (see
        // screenshots/heartbeat/route.ts), so it reflects "app is running"
        // even before that employee's first screenshot of the day exists.
        devices: {
          orderBy: { lastSeenAt: "desc" },
          take: 1,
          select: { lastSeenAt: true, hostname: true, platform: true },
        },
      },
    }),
  ]);

  return (
    <ScreenshotGallery
      departments={departments}
      employees={employees.map((employee) => ({
        id: employee.id,
        name: employee.name,
        departmentId: employee.departmentId,
        lastSeenAt: employee.devices[0]?.lastSeenAt?.toISOString() ?? null,
        deviceLabel: employee.devices[0]?.hostname ?? employee.devices[0]?.platform ?? null,
      }))}
      isAdmin={isAdmin}
    />
  );
}
