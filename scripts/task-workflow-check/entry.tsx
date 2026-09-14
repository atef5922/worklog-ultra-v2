import React from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { DashboardWorkPlanSection } from "../../src/components/dashboard/dashboard-work-plan-table";
import { AssignmentWorkPanel } from "../../src/components/dashboard/assignment-work-panel";
import { DashboardWorkspaceModal } from "../../src/components/dashboard/dashboard-workspace-modal";
import { toDateOnly } from "../../src/lib/utils";

declare global {
  interface Window {
    phaseOneTest: { failNext: "" | "http" | "html" | "network"; requests: Array<{ url: string; body: Record<string, unknown> }>; submitted: boolean; monitorEvents: string[] };
  }
}
const id = "11111111-1111-4111-8111-111111111111", day = toDateOnly();
window.phaseOneTest = { failNext: "", requests: [], submitted: false, monitorEvents: [] };
for (const event of ["worklog:task-monitor-start", "worklog:task-monitor-stop"]) {
  window.addEventListener(event, () => window.phaseOneTest.monitorEvents.push(event));
}
let update = { reportDate: day, status: "pending", trackedMinutes: 0, actualStart: null as string | null, actualEnd: null as string | null, note: null as string | null };
window.fetch = async (input, init) => {
  const url = String(input);
  const body = init?.body instanceof FormData ? Object.fromEntries(init.body) : JSON.parse(String(init?.body ?? "{}"));
  window.phaseOneTest.requests.push({ url, body });
  const failure = window.phaseOneTest.failNext;
  window.phaseOneTest.failNext = "";
  await new Promise(resolve => setTimeout(resolve, 120));
  if (failure === "network") throw new TypeError("Synthetic network failure");
  if (failure === "html") return new Response("<html>Login</html>");
  if (failure === "http") return Response.json({ message: "Synthetic save rejected" }, { status: 409 });
  if (url.endsWith("/review")) return Response.json({ message: "Review submitted" });
  if (url.endsWith("/report")) {
    const next = body.updates[0];
    if (next.status === "done") throw new Error("Legacy report completion request detected");
    update = { ...update, ...next, actualStart: next.actualStart ? new Date(next.actualStart + (next.actualStart.endsWith("Z") ? "" : ":00+06:00")).toISOString() : null,
      actualEnd: next.actualEnd ? new Date(next.actualEnd + (next.actualEnd.endsWith("Z") ? "" : ":00+06:00")).toISOString() : null };
    return Response.json({ message: "Timer saved" });
  }
  if (body.action === "complete_task") update = { ...update, status: "done", trackedMinutes: body.trackedMinutes,
    actualStart: body.actualStart ? new Date(body.actualStart + (body.actualStart.endsWith("Z") ? "" : ":00+06:00")).toISOString() : null,
    actualEnd: new Date().toISOString(), note: body.completionNote };
  else if (body.action === "reopen_task") update = { ...update, status: "in_progress", note: "Reopened: " + body.reopenReason };
  else throw new Error("Unexpected task action");
  return Response.json({ message: body.action === "complete_task" ? "Task completed" : "Task reopened", taskUpdate: update });
};
const task = { id, taskTitle: "Synthetic workflow task", taskDescription: "Regression test only", priority: "normal", planDate: day,
  userId: "synthetic-user", departmentName: "Test department", updates: [], createdAt: new Date().toISOString() };
const view = new URLSearchParams(location.search).get("view");
createRoot(document.getElementById("root")!).render(<><Toaster />
  {view === "assignment" ? <AssignmentWorkPanel task={task} attendanceRunning initialNote="Supporting evidence" onSubmitted={() => { window.phaseOneTest.submitted = true; }}/>
    : view === "modal" ? <DashboardWorkspaceModal departments={[{ id, name: "Test department" }]} initialTasks={[]} suggestions={[]} role="employee" assignableUsers={[]} currentUserId="synthetic-user" userDepartmentId={id}/>
      : <DashboardWorkPlanSection tasks={[task]} canEdit attendanceRunning currentUserId="synthetic-user" formattedDate={day} />}
</>);
