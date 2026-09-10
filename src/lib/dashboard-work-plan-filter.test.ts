import { describe, expect, it } from "vitest";
import {
  filterTodaysWorkPlanTasks,
  getTaskDaySeed,
  getTaskStatusForDashboard,
  isCarriedOverTask,
  matchesDashboardWorkPlanFilter,
} from "@/lib/dashboard-work-plan-filter";

const today = "2026-09-10";

function task(
  id: string,
  planDate: string,
  updates: Array<{
    status: "done" | "in_progress" | "pending";
    reportDate: string;
    trackedMinutes?: number;
    actualStart?: string | null;
    actualEnd?: string | null;
  }> = [],
  taskDescription = "",
) {
  return {
    id,
    taskTitle: id,
    taskDescription,
    priority: "normal",
    planDate,
    updates,
  };
}

describe("dashboard work-plan carry-over", () => {
  it("keeps pending and in-progress work, but not an untouched old completion", () => {
    const rows = [
      task("pending", "2026-09-09"),
      task("paused", "2026-09-09", [
        { status: "in_progress", reportDate: "2026-09-09", trackedMinutes: 20 },
      ]),
      task("done", "2026-09-09", [
        { status: "done", reportDate: "2026-09-09", trackedMinutes: 30 },
      ]),
    ];

    expect(filterTodaysWorkPlanTasks(rows, today).map((row) => row.id)).toEqual([
      "pending",
      "paused",
    ]);
    expect(isCarriedOverTask(rows[0], today)).toBe(true);
  });

  it("inherits only status and resets daily timer fields", () => {
    const carried = task("paused", "2026-09-09", [
      {
        status: "in_progress",
        reportDate: "2026-09-09",
        trackedMinutes: 42,
        actualStart: "2026-09-09T10:00",
        actualEnd: "2026-09-09T10:42",
      },
    ]);

    expect(getTaskStatusForDashboard(carried, today)).toBe("in_progress");
    expect(getTaskDaySeed(carried, today)).toMatchObject({
      status: "in_progress",
      trackedMinutes: 0,
      actualStart: null,
      actualEnd: null,
      update: null,
    });
  });

  it("uses an exact-day update when one exists", () => {
    const carried = task("worked-today", "2026-09-09", [
      { status: "in_progress", reportDate: today, trackedMinutes: 7 },
      { status: "in_progress", reportDate: "2026-09-09", trackedMinutes: 42 },
    ]);

    expect(getTaskDaySeed(carried, today).trackedMinutes).toBe(7);
  });

  it("hides an impossible End Time that is earlier than Start Time", () => {
    const invalidRange = task("invalid-range", "2026-09-09", [
      {
        status: "in_progress",
        reportDate: "2026-09-09",
        actualStart: "2026-09-09T16:44",
        actualEnd: "2026-09-09T15:43",
      },
    ]);

    expect(getTaskDaySeed(invalidRange, "2026-09-09")).toMatchObject({
      actualStart: "2026-09-09T16:44",
      actualEnd: null,
    });
  });

  it("carries an unfinished follow-up beyond its scheduled date", () => {
    const followUp = task(
      "follow-up",
      "2026-09-08",
      [{ status: "in_progress", reportDate: "2026-09-09", trackedMinutes: 5 }],
      "[follow-up-reminder]\nScheduled date: 2026-09-09\nScheduled time: 10:00",
    );

    expect(filterTodaysWorkPlanTasks([followUp], today)).toHaveLength(1);
  });

  it("does not carry a completed recurring occurrence into the next day", () => {
    const recurringDone = task(
      "recurring-done",
      "2026-09-09",
      [{ status: "done", reportDate: "2026-09-09", trackedMinutes: 15 }],
      "[recurring-task]",
    );
    const recurringOpen = task(
      "recurring-open",
      "2026-09-09",
      [
        {
          status: "in_progress",
          reportDate: "2026-09-09",
          trackedMinutes: 5,
        },
      ],
      "[recurring-task]",
    );

    expect(
      filterTodaysWorkPlanTasks([recurringDone, recurringOpen], today).map(
        (row) => row.id,
      ),
    ).toEqual(["recurring-open"]);
  });
});

describe("dashboard work-plan status filters", () => {
  it("treats Active as the running subset of In Progress", () => {
    expect(matchesDashboardWorkPlanFilter("pending", false, "pending")).toBe(true);
    expect(matchesDashboardWorkPlanFilter("in_progress", true, "active")).toBe(true);
    expect(matchesDashboardWorkPlanFilter("in_progress", true, "in_progress")).toBe(true);
    expect(matchesDashboardWorkPlanFilter("in_progress", false, "active")).toBe(false);
    expect(matchesDashboardWorkPlanFilter("in_progress", false, "in_progress")).toBe(true);
    expect(matchesDashboardWorkPlanFilter("done", false, "completed")).toBe(true);
  });

  it("includes every lifecycle state in All", () => {
    expect(matchesDashboardWorkPlanFilter("pending", false, "all")).toBe(true);
    expect(matchesDashboardWorkPlanFilter("in_progress", false, "all")).toBe(true);
    expect(matchesDashboardWorkPlanFilter("done", false, "all")).toBe(true);
  });
});
