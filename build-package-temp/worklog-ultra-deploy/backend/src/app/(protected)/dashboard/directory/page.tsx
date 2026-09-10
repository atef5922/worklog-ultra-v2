import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/server";
import { roleUiTitle } from "@/lib/auth/roles";
import { getWorkspaceDirectoryData } from "@/lib/worklog";

export const dynamic = "force-dynamic";

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function priorityTone(priority: string) {
  if (priority === "critical" || priority === "high") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (priority === "normal") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-600";
}

function statusTone(status: string) {
  if (status === "done") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "in_progress") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  if (status === "pending") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-600";
}

export default async function DirectoryPage() {
  await requireUser();
  const users = await getWorkspaceDirectoryData();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Others Plan</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 xl:grid-cols-2">
          {users.map((user) => (
            <div key={user.id} className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-5">
              <div className="flex items-start gap-4">
                <Avatar className="h-14 w-14 border-white/10">
                  {user.avatarUrl ? <AvatarImage alt={user.name} src={user.avatarUrl} /> : null}
                  <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-lg font-semibold text-[var(--foreground)]">{user.name}</p>
                    <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-700">
                      {roleUiTitle(user.role)}
                    </span>
                  </div>
                  <p className="text-sm text-blue-600">{user.departmentName}</p>
                  <p className="text-sm text-[var(--muted-foreground)]">{user.designation ?? roleUiTitle(user.role)}</p>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-[var(--foreground)]">Today&apos;s Planned Work</p>
                  <span className="text-xs text-blue-600">{user.todaysPlans.length} task(s)</span>
                </div>
                {user.todaysPlans.length ? (
                  <ol className="space-y-3">
                    {user.todaysPlans.map((task, index) => (
                      <li key={task.id} className="flex items-start justify-between gap-3 border-b border-[var(--panel-border)] pb-3 last:border-b-0 last:pb-0">
                        <div className="flex min-w-0 gap-3">
                          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
                            {index + 1}
                          </span>
                          <p className="min-w-0 truncate font-medium text-[var(--foreground)]">{task.title}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${priorityTone(task.priority)}`}>
                            {task.priority}
                          </span>
                          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${statusTone(task.status)}`}>
                            {task.status.replace("_", " ")}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-[var(--muted-foreground)]">No morning plan added yet for today.</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
