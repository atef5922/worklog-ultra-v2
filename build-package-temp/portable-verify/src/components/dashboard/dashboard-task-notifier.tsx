"use client";

import { CheckCircle2, BellRing, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

type NotifierTask = {
  id: string;
  title: string;
  status: "done" | "in_progress" | "pending";
  trackedMinutes: number;
  actualEnd?: string | null;
};

type PopupState =
  | { kind: "completed"; task: NotifierTask }
  | { kind: "pending"; task: NotifierTask }
  | { kind: "morning-pending"; tasks: NotifierTask[] };

function getDhakaHour() {
  const parts = new Intl.DateTimeFormat("en-BD", {
    timeZone: "Asia/Dhaka",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  return Number(parts.find((part) => part.type === "hour")?.value ?? "0");
}

function getTodayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function DashboardTaskNotifier({ tasks }: { tasks: NotifierTask[] }) {
  const [popup, setPopup] = useState<PopupState | null>(null);
  const todayKey = useMemo(() => getTodayKey(), []);

  function dismissPopup(nextPopup: PopupState | null) {
    if (typeof window !== "undefined" && nextPopup) {
      if (nextPopup.kind === "completed") {
        window.localStorage.setItem(`task-popup-completed:${todayKey}:${nextPopup.task.id}`, "seen");
        window.sessionStorage.removeItem(`task-popup-completed-event:${todayKey}`);
      } else if (nextPopup.kind === "morning-pending") {
        window.localStorage.setItem(`task-popup-morning-pending:${todayKey}`, "seen");
      } else {
        window.localStorage.setItem(`task-popup-pending-snooze:${todayKey}`, String(Date.now() + 15 * 60 * 1000));
      }
    }

    setPopup(null);
  }

  useEffect(() => {
    if (!popup || popup.kind !== "completed") {
      return;
    }

    const timeout = window.setTimeout(() => {
      dismissPopup(popup);
    }, 3000);

    return () => window.clearTimeout(timeout);
  }, [popup]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const completionEventRaw = window.sessionStorage.getItem(`task-popup-completed-event:${todayKey}`);
    let completedTask: NotifierTask | undefined;

    if (completionEventRaw) {
      try {
        const parsed = JSON.parse(completionEventRaw) as { taskId?: string; timestamp?: number };
        const isFresh = typeof parsed.timestamp === "number" && Date.now() - parsed.timestamp <= 3000;

        if (parsed.taskId && isFresh) {
          completedTask = tasks.find(
            (task) =>
              task.id === parsed.taskId &&
              task.status === "done" &&
              Boolean(task.actualEnd) &&
              window.localStorage.getItem(`task-popup-completed:${todayKey}:${task.id}`) !== "seen",
          );
        }

        if (!isFresh || !completedTask) {
          window.sessionStorage.removeItem(`task-popup-completed-event:${todayKey}`);
        }
      } catch {
        window.sessionStorage.removeItem(`task-popup-completed-event:${todayKey}`);
      }
    }

    if (completedTask) {
      setPopup({ kind: "completed", task: completedTask });
      return;
    }

    const pendingTasks = tasks.filter((task) => task.status !== "done");
    const morningPendingSeen = window.localStorage.getItem(`task-popup-morning-pending:${todayKey}`) === "seen";

    if (pendingTasks.length && getDhakaHour() < 12 && !morningPendingSeen) {
      setPopup({ kind: "morning-pending", tasks: pendingTasks.slice(0, 5) });
      return;
    }

    const pendingTask = tasks.find((task) => task.status !== "done");
    const snoozeUntil = Number(window.localStorage.getItem(`task-popup-pending-snooze:${todayKey}`) ?? "0");

    if (pendingTask && getDhakaHour() >= 19 && Date.now() > snoozeUntil) {
      setPopup({ kind: "pending", task: pendingTask });
      fetch("/api/dashboard/reminders/self", { method: "POST" }).catch(() => null);
    }
  }, [tasks, todayKey]);

  if (!popup) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.32)] p-4 backdrop-blur-sm">
      <div className="w-full max-w-[420px] rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
        <div className="flex justify-end">
          <button
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            onClick={() => dismissPopup(popup)}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-col items-center text-center">
          <div
            className={`flex h-20 w-20 items-center justify-center rounded-full ${
              popup.kind === "completed"
                ? "bg-emerald-100 text-emerald-600"
                : popup.kind === "morning-pending"
                  ? "bg-[#eef2ff] text-[#4f5ef7]"
                  : "bg-amber-100 text-amber-600"
            }`}
          >
            {popup.kind === "completed" ? (
              <CheckCircle2 className="h-10 w-10" />
            ) : (
              <BellRing className={`h-10 w-10 ${popup.kind === "morning-pending" ? "animate-pulse" : ""}`} />
            )}
          </div>
          <h3
            className={`mt-5 text-[1.75rem] font-bold ${
              popup.kind === "completed"
                ? "text-emerald-700"
                : popup.kind === "morning-pending"
                  ? "text-[#3148d8]"
                  : "text-amber-700"
            }`}
          >
            {popup.kind === "completed"
              ? "Great! Task Completed"
              : popup.kind === "morning-pending"
                ? "Good Morning Reminder"
                : "Task Pending Reminder"}
          </h3>
          {popup.kind === "morning-pending" ? (
            <>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                These pending tasks need your attention today. Keep them in mind before you start the day.
              </p>
              <div className="mt-5 w-full rounded-[22px] border border-[#dbe4ff] bg-[#f7f9ff] p-4 text-left">
                <div className="space-y-2">
                  {popup.tasks.map((task, index) => (
                    <div
                      key={task.id}
                      className="flex items-center justify-between gap-3 rounded-2xl bg-white/90 px-3 py-2 shadow-[0_8px_20px_rgba(79,94,247,0.08)]"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-800">
                          {index + 1}. {task.title}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700">
                        {task.status === "in_progress" ? "Running" : "Pending"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <p className="mt-4 text-base font-semibold text-slate-700">You have {popup.tasks.length} task{popup.tasks.length > 1 ? "s" : ""} to remember today.</p>
            </>
          ) : (
            <>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                <span className="font-semibold">{popup.task.title}</span>
                {popup.kind === "completed"
                  ? " has been marked as completed."
                  : " is still pending. Please review it before the day closes."}
              </p>
              <p className="mt-4 text-base font-semibold text-slate-700">
                {popup.kind === "completed"
                  ? `Time Spent: ${Math.max(1, popup.task.trackedMinutes)}m`
                  : `Remaining attention needed today`}
              </p>
            </>
          )}
        </div>
        <div className="mt-6 space-y-3">
          <Link
            className={`button-force-white flex h-12 w-full items-center justify-center rounded-2xl text-sm font-semibold ${
              popup.kind === "completed"
                ? "bg-[#315fe6] hover:bg-[#274fc0]"
                : popup.kind === "morning-pending"
                  ? "bg-[#4f5ef7] hover:bg-[#4453eb]"
                  : "bg-amber-500 hover:bg-amber-600"
            }`}
            href={popup.kind === "morning-pending" ? "/dashboard" : "/dashboard/report"}
            onClick={() => {
              dismissPopup(popup);
            }}
          >
            {popup.kind === "completed" ? "View Task" : popup.kind === "morning-pending" ? "Keep It In Mind" : "Go to Task"}
          </Link>
          <button
            className="w-full text-center text-sm font-semibold text-slate-500 transition hover:text-slate-700"
            onClick={() => dismissPopup(popup)}
            type="button"
          >
            {popup.kind === "completed" ? "Close" : popup.kind === "morning-pending" ? "Close Reminder" : "Snooze 15 min"}
          </button>
        </div>
      </div>
    </div>
  );
}
