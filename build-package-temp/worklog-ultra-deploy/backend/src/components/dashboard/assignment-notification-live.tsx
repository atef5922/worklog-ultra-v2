"use client";

import { ClipboardCheck, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type AssignmentNotification = {
  taskId: string;
  taskTitle: string;
  assigneeName: string;
  assigneeDepartmentName: string;
  status: "done" | "in_progress" | "pending";
  note: string;
  trackedMinutes: number;
  updatedAt: string;
};

function getReadKey(item: AssignmentNotification) {
  return `assignment-notification-read:${item.taskId}:${item.updatedAt}`;
}

function getSeenKey(item: AssignmentNotification) {
  return `assignment-notification-seen:${item.taskId}:${item.updatedAt}`;
}

export function AssignmentNotificationLive() {
  const [items, setItems] = useState<AssignmentNotification[]>([]);
  const [closedKeys, setClosedKeys] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadNotifications() {
      const response = await fetch("/api/dashboard/assignment-notifications", { cache: "no-store" });
      const result = (await response.json().catch(() => ({ notifications: [] }))) as {
        notifications?: AssignmentNotification[];
      };

      if (cancelled || !response.ok) {
        return;
      }

      const nextItems = Array.isArray(result.notifications) ? result.notifications : [];
      const visible = nextItems.filter((item) => {
        try {
          return (
            window.localStorage.getItem(getReadKey(item)) !== "read" &&
            window.localStorage.getItem(getSeenKey(item)) !== "seen"
          );
        } catch {
          return true;
        }
      });

      setItems(visible);
    }

    loadNotifications().catch(() => null);
    const interval = window.setInterval(() => {
      loadNotifications().catch(() => null);
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const activeItem = useMemo(
    () => items.find((item) => !closedKeys.includes(getSeenKey(item))) ?? null,
    [closedKeys, items],
  );

  function closePopup(item: AssignmentNotification) {
    try {
      window.localStorage.setItem(getSeenKey(item), "seen");
    } catch {
      // ignore storage errors
    }

    setClosedKeys((current) => [...current, getSeenKey(item)]);
  }

  function markAsRead(item: AssignmentNotification) {
    try {
      window.localStorage.setItem(getReadKey(item), "read");
      window.localStorage.setItem(getSeenKey(item), "seen");
    } catch {
      // ignore storage errors
    }
  }

  if (!activeItem) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.32)] p-4 backdrop-blur-sm">
      <div className="w-full max-w-[460px] rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
        <div className="flex justify-end">
          <button
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            onClick={() => closePopup(activeItem)}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-col items-center text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-violet-100 text-violet-600">
            <ClipboardCheck className="h-10 w-10" />
          </div>
          <h3 className="mt-5 text-[1.65rem] font-bold text-violet-700">Assignment Update</h3>
          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">
            {activeItem.assigneeName} · {activeItem.assigneeDepartmentName}
          </p>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            <span className="font-semibold">{activeItem.taskTitle}</span>{" "}
            {activeItem.status === "done" ? "has been completed." : "has a new submission update."}
          </p>
          <p className="mt-3 text-sm font-medium text-slate-700">
            {activeItem.note ? `Note: ${activeItem.note}` : `Tracked time: ${Math.max(0, activeItem.trackedMinutes)}m`}
          </p>
        </div>
        <div className="mt-6">
          <Link
            className="button-force-white flex h-12 w-full items-center justify-center rounded-2xl bg-[#315fe6] text-sm font-semibold hover:bg-[#274fc0]"
            href="/dashboard/assignments?from=notification"
            onClick={() => markAsRead(activeItem)}
          >
            View Assignment
          </Link>
        </div>
      </div>
    </div>
  );
}
