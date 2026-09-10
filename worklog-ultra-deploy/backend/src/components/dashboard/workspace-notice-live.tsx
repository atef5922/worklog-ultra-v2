"use client";

import { BellRing, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type NoticeItem = {
  id: string;
  title: string;
  body: string;
  publishedAt: string | null;
  authorName: string;
  departmentName: string;
};

export function WorkspaceNoticeLive() {
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [hiddenNoticeIds, setHiddenNoticeIds] = useState<string[]>([]);

  const activeNotice = useMemo(
    () => notices.find((notice) => !hiddenNoticeIds.includes(notice.id)) ?? null,
    [hiddenNoticeIds, notices],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadNotices() {
      const response = await fetch("/api/dashboard/notices", { cache: "no-store" });
      const result = (await response.json().catch(() => ({ notices: [] }))) as { notices?: NoticeItem[] };

      if (cancelled || !response.ok) {
        return;
      }

      const nextNotices = Array.isArray(result.notices) ? result.notices : [];
      const unseenNotices = nextNotices.filter((notice) => {
        try {
          return window.localStorage.getItem(`notice-popup-seen:${notice.id}`) !== "seen";
        } catch {
          return true;
        }
      });

      setNotices(unseenNotices);
    }

    loadNotices().catch(() => null);
    const interval = window.setInterval(() => {
      loadNotices().catch(() => null);
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  function closePopup(noticeId: string) {
    try {
      window.localStorage.setItem(`notice-popup-seen:${noticeId}`, "seen");
    } catch {
      // Ignore storage errors and still hide the popup locally.
    }

    setHiddenNoticeIds((current) => [...current, noticeId]);
  }

  useEffect(() => {
    if (!activeNotice) {
      return;
    }

    const timeout = window.setTimeout(() => {
      closePopup(activeNotice.id);
    }, 5000);

    return () => window.clearTimeout(timeout);
  }, [activeNotice]);

  if (!activeNotice) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.32)] p-4 backdrop-blur-sm">
      <div className="w-full max-w-[460px] rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
        <div className="flex justify-end">
          <button
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            onClick={() => closePopup(activeNotice.id)}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-col items-center text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-100 text-blue-600">
            <BellRing className="h-10 w-10" />
          </div>
          <h3 className="mt-5 text-[1.65rem] font-bold text-blue-700">{activeNotice.title}</h3>
          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.22em] text-blue-500">
            {activeNotice.departmentName} · by {activeNotice.authorName}
          </p>
          <p className="mt-4 text-sm leading-6 text-slate-600">{activeNotice.body}</p>
        </div>
        <div className="mt-6">
          <button
            className="button-force-white flex h-12 w-full items-center justify-center rounded-2xl bg-[#315fe6] text-sm font-semibold hover:bg-[#274fc0]"
            onClick={() => closePopup(activeNotice.id)}
            type="button"
          >
            Close Notice
          </button>
        </div>
      </div>
    </div>
  );
}
