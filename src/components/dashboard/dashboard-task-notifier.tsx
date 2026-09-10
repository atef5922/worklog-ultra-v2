"use client";

import { BellRing, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { extractFollowUpMeta, isFollowUpDueNow } from "@/lib/task-follow-up";

type NotifierTask = {
  id: string;
  title: string;
  status: "done" | "in_progress" | "pending";
  trackedMinutes: number;
  actualEnd?: string | null;
  taskDescription?: string | null;
};

type PopupState =
  | { kind: "pending"; task: NotifierTask }
  | { kind: "follow-up"; task: NotifierTask; reminderNote: string };

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

export function DashboardTaskNotifier({ tasks = [] }: { tasks: NotifierTask[] }) {
  const [popup, setPopup] = useState<PopupState | null>(null);
  const todayKey = useMemo(() => getTodayKey(), []);

  const dismissPopup = useCallback((nextPopup: PopupState | null) => {
    if (typeof window !== "undefined" && nextPopup) {
      if (nextPopup.kind === "follow-up") {
        window.localStorage.setItem(`task-popup-follow-up:${todayKey}:${nextPopup.task.id}`, "seen");
      } else {
        window.localStorage.setItem(`task-popup-pending-snooze:${todayKey}`, String(Date.now() + 15 * 60 * 1000));
      }
    }

    setPopup(null);
  }, [todayKey]);

  useEffect(() => {
    if (!popup) {
      return;
    }

    // A full-screen overlay with no keyboard exit traps anyone not on a mouse.
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        dismissPopup(popup);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dismissPopup, popup]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    function evaluatePopups() {
      const followUpTask = tasks.find((task) => {
        if (task.status === "done") {
          return false;
        }

        const followUpMeta = extractFollowUpMeta(task.taskDescription);
        if (!followUpMeta || !isFollowUpDueNow(followUpMeta)) {
          return false;
        }

        return window.localStorage.getItem(`task-popup-follow-up:${todayKey}:${task.id}`) !== "seen";
      });

      if (followUpTask) {
        const followUpMeta = extractFollowUpMeta(followUpTask.taskDescription);
        setPopup({
          kind: "follow-up",
          task: followUpTask,
          reminderNote: followUpMeta?.reminderNote ?? "",
        });
        return;
      }

      const pendingTask = tasks.find((task) => task.status !== "done");
      const snoozeUntil = Number(window.localStorage.getItem(`task-popup-pending-snooze:${todayKey}`) ?? "0");

      if (pendingTask && getDhakaHour() >= 19 && Date.now() > snoozeUntil) {
        setPopup({ kind: "pending", task: pendingTask });
        fetch("/api/dashboard/reminders/self", { method: "POST" }).catch(() => null);
      }
    }

    evaluatePopups();
    const interval = window.setInterval(evaluatePopups, 60_000);
    return () => window.clearInterval(interval);
  }, [tasks, todayKey]);

  if (!popup) {
    return null;
  }

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[rgba(15,23,42,0.32)] p-4 backdrop-blur-sm"
      role="dialog"
    >
      {/* Capped and compact. Uncapped the card grew with the list — five rows put
          it around 795px tall, which runs off the bottom of a short laptop screen
          and takes both action buttons with it. The body scrolls now and the
          buttons stay pinned to the card. */}
      <div className="relative flex max-h-[calc(100vh-2rem)] w-full max-w-[22rem] flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
        {/* Over the card rather than on a row of its own, which cost the popup
            36px of height before the icon had even started. */}
        <button
          aria-label="Close reminder"
          className="absolute right-2.5 top-2.5 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          onClick={() => dismissPopup(popup)}
          type="button"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2 pt-6">
          <div className="flex flex-col items-center text-center">
            <div
              className={`flex h-14 w-14 items-center justify-center rounded-full ${
                popup.kind === "follow-up"
                  ? "bg-violet-100 text-violet-600"
                  : "bg-amber-100 text-amber-600"
              }`}
            >
              <BellRing className="h-7 w-7" />
            </div>
            <h3
              className={`mt-3 text-[1.2rem] font-bold leading-tight ${
                popup.kind === "follow-up"
                  ? "text-violet-700"
                  : "text-amber-700"
              }`}
            >
              {popup.kind === "follow-up" ? "Follow-up Reminder" : "Task Pending Reminder"}
            </h3>
            {popup.kind === "follow-up" ? (
              <>
                <p className="mt-2 text-[0.8rem] leading-5 text-slate-600">
                  <span className="font-semibold">{popup.task.title}</span> is scheduled for follow-up now.
                </p>
                {popup.reminderNote ? (
                  <p className="mt-3 rounded-2xl border border-violet-100 bg-violet-50 px-3 py-2 text-[0.8rem] text-violet-800">
                    {popup.reminderNote}
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <p className="mt-2 text-[0.8rem] leading-5 text-slate-600">
                  <span className="font-semibold">{popup.task.title}</span>
                  {" is still pending. Please review it before the day closes."}
                </p>
                <p className="mt-3 text-[0.85rem] font-semibold text-slate-700">
                  Remaining attention needed today
                </p>
              </>
            )}
          </div>
        </div>

        <div className="shrink-0 space-y-2 px-5 pb-5 pt-3">
          <Link
            className={`button-force-white flex h-11 w-full items-center justify-center rounded-2xl text-[0.85rem] font-semibold ${
              popup.kind === "follow-up"
                ? "bg-violet-600 hover:bg-violet-700"
                : "bg-amber-500 hover:bg-amber-600"
            }`}
            href="/dashboard"
            onClick={() => {
              dismissPopup(popup);
            }}
          >
            {popup.kind === "follow-up" ? "Open Task" : "Go to Task"}
          </Link>
          <button
            className="w-full text-center text-[0.8rem] font-semibold text-slate-500 transition hover:text-slate-700"
            onClick={() => dismissPopup(popup)}
            type="button"
          >
            {popup.kind === "follow-up" ? "Dismiss" : "Snooze 15 min"}
          </button>
        </div>
      </div>
    </div>
  );
}
