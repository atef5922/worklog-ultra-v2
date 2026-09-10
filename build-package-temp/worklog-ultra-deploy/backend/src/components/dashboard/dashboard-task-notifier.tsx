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
  | { kind: "pending"; task: NotifierTask };

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
              popup.kind === "completed" ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"
            }`}
          >
            {popup.kind === "completed" ? <CheckCircle2 className="h-10 w-10" /> : <BellRing className="h-10 w-10" />}
          </div>
          <h3 className={`mt-5 text-[1.75rem] font-bold ${popup.kind === "completed" ? "text-emerald-700" : "text-amber-700"}`}>
            {popup.kind === "completed" ? "Great! Task Completed" : "Task Pending Reminder"}
          </h3>
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
        </div>
        <div className="mt-6 space-y-3">
          <Link
            className={`button-force-white flex h-12 w-full items-center justify-center rounded-2xl text-sm font-semibold ${
              popup.kind === "completed" ? "bg-[#315fe6] hover:bg-[#274fc0]" : "bg-amber-500 hover:bg-amber-600"
            }`}
            href="/dashboard/report"
            onClick={() => {
              dismissPopup(popup);
            }}
          >
            {popup.kind === "completed" ? "View Task" : "Go to Task"}
          </Link>
          <button
            className="w-full text-center text-sm font-semibold text-slate-500 transition hover:text-slate-700"
            onClick={() => dismissPopup(popup)}
            type="button"
          >
            {popup.kind === "completed" ? "Close" : "Snooze 15 min"}
          </button>
        </div>
      </div>
    </div>
  );
}
