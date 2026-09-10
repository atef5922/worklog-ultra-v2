"use client";

import { CheckCircle2, Pause, Play, RotateCcw, Square } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { readTaskTimerSnapshot, writeTaskTimerSnapshot } from "@/lib/task-timer-storage";
import { toDateTimeInputValue } from "@/lib/utils";

type ReportTask = {
  id: string;
  taskTitle: string;
  updates: Array<{
    status: "done" | "in_progress" | "pending";
    note: string | null;
    completionPercent: number;
    trackedMinutes: number;
    actualStart: Date | null;
    actualEnd: Date | null;
    difficultyLevel: string | null;
  }>;
};

type ReportUpdateState = {
  dailyTaskId: string;
  status: "done" | "in_progress" | "pending";
  note: string;
  completionPercent: string;
  trackedMinutes: string;
  actualStart: string;
  actualEnd: string;
  difficultyLevel: string;
  carryForward: boolean;
  timerState: "idle" | "running" | "paused" | "stopped";
  runningStartedAt: string;
};

const REPORT_STORAGE_PREFIX = "worklog-report-progress";

function toInputDateTime(value: Date | string | null | undefined) {
  if (!value) return "";
  return toDateTimeInputValue(value);
}

function createBaseUpdates(tasks: ReportTask[]): ReportUpdateState[] {
  return tasks.map((task) => ({
    dailyTaskId: task.id,
    status: task.updates[0]?.status ?? "pending",
    note: task.updates[0]?.note ?? "",
    completionPercent: String(task.updates[0]?.completionPercent ?? 0),
    trackedMinutes: String(task.updates[0]?.trackedMinutes ?? 0),
    actualStart: toInputDateTime(task.updates[0]?.actualStart),
    actualEnd: toInputDateTime(task.updates[0]?.actualEnd),
    difficultyLevel: task.updates[0]?.difficultyLevel ?? "",
    carryForward: false,
    timerState:
      "idle",
    runningStartedAt: "",
  }));
}

function mergeStoredUpdates(baseUpdates: ReportUpdateState[], storageKey: string, reportDate: string) {
  if (typeof window === "undefined") {
    return baseUpdates;
  }

  const raw = window.localStorage.getItem(storageKey);

  try {
    const parsed = raw ? (JSON.parse(raw) as Array<Partial<ReportUpdateState>>) : [];
    const storedByTaskId = new Map(
      parsed
        .filter((item) => typeof item.dailyTaskId === "string")
        .map((item) => [item.dailyTaskId as string, sanitizeStoredUpdate(item)]),
    );

    return baseUpdates.map((item) => {
      const sharedTimer = readTaskTimerSnapshot(reportDate, item.dailyTaskId);
      return {
        ...item,
        ...(sharedTimer
          ? {
              status: sharedTimer.status,
              trackedMinutes: sharedTimer.trackedMinutes,
              actualStart: sharedTimer.actualStart,
              actualEnd: sharedTimer.actualEnd,
              runningStartedAt: sharedTimer.runningStartedAt,
              timerState:
                sharedTimer.runningStartedAt
                  ? "running"
                  : sharedTimer.actualEnd
                    ? "stopped"
                    : sharedTimer.status === "in_progress"
                      ? "paused"
                      : item.timerState,
            }
          : {}),
        ...(storedByTaskId.get(item.dailyTaskId) ?? {}),
      };
    });
  } catch {
    return baseUpdates;
  }
}

function sanitizeStoredUpdate(value: Partial<ReportUpdateState>): Partial<ReportUpdateState> {
  return {
    status:
      value.status === "done" || value.status === "in_progress" || value.status === "pending"
        ? value.status
        : undefined,
    note: typeof value.note === "string" ? value.note : undefined,
    completionPercent: typeof value.completionPercent === "string" ? value.completionPercent : undefined,
    trackedMinutes: typeof value.trackedMinutes === "string" ? value.trackedMinutes : undefined,
    actualStart: typeof value.actualStart === "string" ? value.actualStart : undefined,
    actualEnd: typeof value.actualEnd === "string" ? value.actualEnd : undefined,
    difficultyLevel: typeof value.difficultyLevel === "string" ? value.difficultyLevel : undefined,
    carryForward: typeof value.carryForward === "boolean" ? value.carryForward : undefined,
    timerState:
      value.timerState === "idle" ||
      value.timerState === "running" ||
      value.timerState === "paused" ||
      value.timerState === "stopped"
        ? value.timerState
        : undefined,
    runningStartedAt: typeof value.runningStartedAt === "string" ? value.runningStartedAt : undefined,
  };
}

function mirrorSharedTimer(reportDate: string, item: ReportUpdateState) {
  writeTaskTimerSnapshot(reportDate, item.dailyTaskId, {
    status: item.status,
    trackedMinutes: item.trackedMinutes,
    actualStart: item.actualStart,
    actualEnd: item.actualEnd,
    runningStartedAt: item.runningStartedAt,
  });
}

function calculateManualTrackedMinutes(actualStart: string, actualEnd: string) {
  if (!actualStart || !actualEnd) {
    return null;
  }

  const start = new Date(actualStart);
  const end = new Date(actualEnd);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return null;
  }

  return Math.floor((end.getTime() - start.getTime()) / 60000);
}

export function ReportForm({
  tasks,
  reportDate,
  canEdit,
  currentUserId,
  onSaved,
}: {
  tasks: ReportTask[];
  reportDate: string;
  canEdit: boolean;
  currentUserId: string;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const storageKey = useMemo(() => `${REPORT_STORAGE_PREFIX}:${currentUserId}:${reportDate}`, [currentUserId, reportDate]);
  const storageLoadedRef = useRef(false);
  const isHydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [loading, setLoading] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const [now, setNow] = useState(() => (typeof window === "undefined" ? 0 : Date.now()));
  const [updates, setUpdates] = useState<ReportUpdateState[]>(() => createBaseUpdates(tasks));

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    const nextUpdates = mergeStoredUpdates(createBaseUpdates(tasks), storageKey, reportDate);
    queueMicrotask(() => {
      storageLoadedRef.current = true;
      setUpdates(nextUpdates);
    });
  }, [isHydrated, reportDate, storageKey, tasks]);

  useEffect(() => {
    if (!isHydrated || typeof window === "undefined" || !storageLoadedRef.current) {
      return;
    }

    if (!updates.length) {
      window.localStorage.removeItem(storageKey);
      return;
    }

    const snapshot = updates.map((item) => ({
      dailyTaskId: item.dailyTaskId,
      status: item.status,
      note: item.note,
      completionPercent: item.completionPercent,
      trackedMinutes: item.trackedMinutes,
      actualStart: item.actualStart,
      actualEnd: item.actualEnd,
      difficultyLevel: item.difficultyLevel,
      carryForward: item.carryForward,
      timerState: item.timerState,
      runningStartedAt: item.runningStartedAt,
    }));

    window.localStorage.setItem(storageKey, JSON.stringify(snapshot));

    for (const item of updates) {
      writeTaskTimerSnapshot(reportDate, item.dailyTaskId, {
        status: item.status,
        trackedMinutes: item.trackedMinutes,
        actualStart: item.actualStart,
        actualEnd: item.actualEnd,
        runningStartedAt: item.runningStartedAt,
      });
    }
  }, [isHydrated, reportDate, storageKey, updates]);

  function patch(index: number, key: keyof ReportUpdateState, value: string) {
    setUpdates((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item)),
    );
  }

  function patchCarryForward(index: number, value: boolean) {
    setUpdates((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, carryForward: value } : item)),
    );
  }

  function patchDateTime(index: number, key: "actualStart" | "actualEnd", value: string) {
    setUpdates((current) =>
      current.map((item, itemIndex) => {
        if (itemIndex !== index) {
          return item;
        }

        const nextItem = { ...item, [key]: value };
        const manualTrackedMinutes = calculateManualTrackedMinutes(nextItem.actualStart, nextItem.actualEnd);

        if (manualTrackedMinutes === null) {
          return {
            ...nextItem,
            timerState: key === "actualEnd" && value ? "paused" : nextItem.timerState,
            runningStartedAt: key === "actualEnd" && value ? "" : nextItem.runningStartedAt,
          };
        }

        return {
          ...nextItem,
          trackedMinutes: String(manualTrackedMinutes),
          timerState: nextItem.actualEnd ? "stopped" : "paused",
          runningStartedAt: "",
          status: nextItem.actualEnd && nextItem.status === "pending" ? "done" : nextItem.status,
          completionPercent:
            nextItem.actualEnd && Number(nextItem.completionPercent || 0) === 0
              ? "100"
              : nextItem.completionPercent,
        };
      }),
    );
  }

  function currentTrackedSecondsFor(item: ReportUpdateState) {
    const baseSeconds = Number(item.trackedMinutes || 0) * 60;

    if (item.timerState !== "running" || !item.runningStartedAt) {
      return baseSeconds;
    }

    return baseSeconds + Math.max(0, Math.floor((now - new Date(item.runningStartedAt).getTime()) / 1000));
  }

  function formatLiveDuration(totalSeconds: number) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
  }

  function normalizedUpdates(source = updates) {
    return source.map((item) => ({
      dailyTaskId: item.dailyTaskId,
      status: item.status,
      note: item.note,
      completionPercent: Number(item.completionPercent || 0),
      trackedMinutes: Math.floor(currentTrackedSecondsFor(item) / 60),
      actualStart: item.actualStart,
      actualEnd: item.actualEnd,
      difficultyLevel: item.difficultyLevel,
      carryForward: item.carryForward,
    }));
  }

  async function persistReport(source = updates, options?: { silent?: boolean; refresh?: boolean }) {
    if (options?.silent) {
      setAutoSaving(true);
    } else {
      setLoading(true);
    }

    const response = await fetch("/api/dashboard/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportDate, updates: normalizedUpdates(source) }),
    });
    const raw = await response.text();
    const result = raw ? JSON.parse(raw) : { message: "Report save failed." };

    if (options?.silent) {
      setAutoSaving(false);
    } else {
      setLoading(false);
    }

    if (!response.ok) {
      toast.error(result.message ?? "Report save failed.");
      return false;
    }

    if (options?.silent) {
      toast.success("Task time auto-saved.");
    } else {
      toast.success(result.message);
    }

    if (options?.refresh ?? true) {
      router.refresh();
    }

    if (!options?.silent) {
      onSaved?.();
    }

    return true;
  }

  async function save() {
    await persistReport(updates, { refresh: true });
  }

  async function updateTimer(index: number, nextState: "running" | "paused" | "stopped") {
    if (!canEdit) return;
    const timestamp = new Date();
    const timestampValue = timestamp.toISOString();
    const timestampInputValue = toDateTimeInputValue(timestamp);

    const nextUpdates = updates.map((item, itemIndex) => {
      if (itemIndex !== index) return item;

      const liveMinutes = Math.floor(currentTrackedSecondsFor(item) / 60);

      if (nextState === "running") {
        if (item.timerState === "running") {
          return item;
        }

        return {
          ...item,
          status: item.status === "pending" ? "in_progress" : item.status,
          actualStart: item.actualStart || timestampInputValue,
          actualEnd: "",
          timerState: "running" as const,
          runningStartedAt: timestampValue,
          trackedMinutes: String(Number(item.trackedMinutes || 0)),
        };
      }

        return {
          ...item,
          status: nextState === "stopped" ? ("done" as const) : item.status,
        completionPercent:
          nextState === "stopped" && Number(item.completionPercent || 0) === 0
            ? "100"
            : item.completionPercent,
          trackedMinutes: String(liveMinutes),
          actualEnd: nextState === "stopped" ? timestampInputValue : item.actualEnd,
          carryForward: nextState === "stopped" ? false : item.carryForward,
          timerState: nextState,
          runningStartedAt: "",
        };
    });

    setUpdates(nextUpdates);
    const target = nextUpdates[index];
    if (target) {
      mirrorSharedTimer(reportDate, target);
    }

    if (nextState === "stopped") {
      await persistReport(nextUpdates, { silent: true, refresh: false });
    }
  }

  function resetTimer(index: number) {
    if (!canEdit) return;

    setUpdates((current) => {
      const nextUpdates: ReportUpdateState[] = current.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              status: "pending" as const,
              completionPercent: "0",
              trackedMinutes: "0",
              actualStart: "",
              actualEnd: "",
              carryForward: false,
              timerState: "idle" as const,
              runningStartedAt: "",
            }
          : item,
      );

      const target = nextUpdates[index];
      if (target) {
        mirrorSharedTimer(reportDate, target);
      }

      return nextUpdates;
    });
  }

  async function endNow(index: number) {
    if (!canEdit) return;
    const timestamp = new Date();
    const timestampInputValue = toDateTimeInputValue(timestamp);
    const nextUpdates = updates.map((item, itemIndex) =>
      itemIndex === index
        ? {
            ...item,
            actualEnd: timestampInputValue,
            status: item.status === "pending" ? ("done" as const) : item.status,
            completionPercent: Number(item.completionPercent || 0) === 0 ? "100" : item.completionPercent,
            trackedMinutes: String(Math.floor(currentTrackedSecondsFor(item) / 60)),
            timerState: "stopped" as const,
            carryForward: false,
            runningStartedAt: "",
          }
        : item,
    );

    setUpdates(nextUpdates);
    const target = nextUpdates[index];
    if (target) {
      mirrorSharedTimer(reportDate, target);
    }
    await persistReport(nextUpdates, { silent: true, refresh: false });
  }

  const totalTrackedSeconds = updates.reduce((sum, item) => sum + currentTrackedSecondsFor(item), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Evening Work Report</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-white">Employee time tracker</p>
              <p className="text-sm text-[var(--muted-foreground)]">
                Start, pause, stop, or instantly mark task end here. Running timers stay alive across page changes until you pause or stop them.
              </p>
            </div>
            <div className="rounded-full border border-[var(--panel-border)] bg-[var(--panel)] px-4 py-2 text-sm font-semibold text-white">
              {formatLiveDuration(totalTrackedSeconds)} tracked today
            </div>
          </div>
        </div>

        {tasks.map((task, index) => (
          <div key={task.id} className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-base font-semibold text-white">{task.taskTitle}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  className="tracker-button tracker-button-start"
                  disabled={!canEdit || updates[index]?.timerState === "running"}
                  onClick={() => updateTimer(index, "running")}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  <Play className="h-4 w-4" />
                  {updates[index]?.timerState === "paused" ? "Resume" : "Start"}
                </Button>
                <Button
                  className="tracker-button tracker-button-pause"
                  disabled={updates[index]?.timerState !== "running"}
                  onClick={() => updateTimer(index, "paused")}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <Pause className="h-4 w-4" />
                  Pause
                </Button>
                <Button
                  className="tracker-button tracker-button-stop"
                  disabled={updates[index]?.timerState === "idle"}
                  onClick={() => updateTimer(index, "stopped")}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <Square className="h-4 w-4" />
                  Stop
                </Button>
                <Button
                  className="tracker-button tracker-button-end"
                  disabled={!canEdit}
                  onClick={() => endNow(index)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  End Now
                </Button>
                <Button
                  className="tracker-button tracker-button-reset"
                  disabled={!canEdit || updates[index]?.timerState === "running"}
                  onClick={() => resetTimer(index)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <RotateCcw className="h-4 w-4" />
                  Reset
                </Button>
                <span className="tracker-duration-chip">
                  {formatLiveDuration(currentTrackedSecondsFor(updates[index]))}
                </span>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <Label>Status</Label>
                <Select value={updates[index]?.status} onValueChange={(value) => patch(index, "status", value)}>
                  <SelectTrigger disabled={!canEdit}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="done">Done</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Completion %</Label>
                <Input
                  disabled={!canEdit}
                  onChange={(event) => patch(index, "completionPercent", event.target.value)}
                  type="number"
                  value={updates[index]?.completionPercent}
                />
              </div>
              <div>
                <Label>Tracked Minutes</Label>
                <Input readOnly type="number" value={String(Math.floor(currentTrackedSecondsFor(updates[index]) / 60))} />
              </div>
              <div>
                <Label>Difficulty</Label>
                <Input
                  disabled={!canEdit}
                  onChange={(event) => patch(index, "difficultyLevel", event.target.value)}
                  placeholder="Low / Medium / High"
                  value={updates[index]?.difficultyLevel}
                />
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <Label>Actual Start</Label>
                <Input
                  disabled={!canEdit}
                  onChange={(event) => patchDateTime(index, "actualStart", event.target.value)}
                  type="datetime-local"
                  value={updates[index]?.actualStart}
                />
              </div>
              <div>
                <Label>Actual End</Label>
                <div className="flex gap-3">
                  <Input
                    className="flex-1"
                    disabled={!canEdit}
                    onChange={(event) => patchDateTime(index, "actualEnd", event.target.value)}
                    type="datetime-local"
                    value={updates[index]?.actualEnd}
                  />
                  <Button
                    className="tracker-button tracker-button-end"
                    disabled={!canEdit}
                    onClick={() => endNow(index)}
                    type="button"
                    variant="outline"
                  >
                    End
                  </Button>
                </div>
              </div>
            </div>

            <div className="mt-4">
              <Label>Work Note</Label>
              <Textarea
                disabled={!canEdit}
                onChange={(event) => patch(index, "note", event.target.value)}
                value={updates[index]?.note}
              />
            </div>

          </div>
        ))}

        <Button className="w-full" disabled={!canEdit || loading || autoSaving || !tasks.length} onClick={save} type="button">
          {loading ? "Saving report..." : autoSaving ? "Auto-saving..." : "Submit Today's Report"}
        </Button>
      </CardContent>
    </Card>
  );
}
