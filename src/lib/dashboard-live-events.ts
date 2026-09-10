export type DashboardLiveTask = {
  id: string;
  taskTitle: string;
  taskDescription?: string | null;
  priority: string;
  planDate: string;
  userId: string;
  departmentName: string;
  assignedBy?: string | null;
};

export type DashboardRemovedTask = {
  id: string;
  taskTitle: string;
};

export const DASHBOARD_TASKS_CREATED_EVENT = "dashboard:tasks-created";
export const DASHBOARD_TASKS_REMOVED_EVENT = "dashboard:tasks-removed";
export const DASHBOARD_TASK_AUTOSTART_STORAGE_KEY = "dashboard-task-autostart";
/**
 * Checking out ends the working day, so any task still counting time has to stop
 * with it — otherwise a task keeps accruing minutes against a day the user has
 * already left. Every task timer on the page listens; the ones not running
 * ignore it.
 */
export const ATTENDANCE_STOPPED_EVENT = "dashboard:attendance-stopped";
/**
 * The counterpart, so a task timer can re-enable itself the moment the user
 * checks back in rather than waiting for the server round trip to land.
 */
export const ATTENDANCE_STARTED_EVENT = "dashboard:attendance-started";
/**
 * Fired once the Notices page has marked everything it just displayed as
 * read (see notices-read:<id> in localStorage). The header bell and the
 * sidebar's unread dot each poll on their own schedule already, but without
 * this they would not notice a read happened until their next interval — up
 * to 15s of the badge still showing for notices the user is looking at right
 * now.
 */
export const NOTICES_READ_EVENT = "dashboard:notices-read";

export function dispatchDashboardTasksCreated(tasks: DashboardLiveTask[]) {
  if (typeof window === "undefined" || !tasks.length) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(DASHBOARD_TASKS_CREATED_EVENT, {
      detail: { tasks },
    }),
  );
}

export function dispatchDashboardTasksRemoved(tasks: DashboardRemovedTask[]) {
  if (typeof window === "undefined" || !tasks.length) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(DASHBOARD_TASKS_REMOVED_EVENT, {
      detail: { tasks },
    }),
  );
}

export function scheduleDashboardTaskAutostart(taskId: string, reportDate: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(
    DASHBOARD_TASK_AUTOSTART_STORAGE_KEY,
    JSON.stringify({
      taskId,
      reportDate,
      timestamp: Date.now(),
    }),
  );
}
