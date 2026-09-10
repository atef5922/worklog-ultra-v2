"use client";

import { Camera } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

export function TaskScreenshotMonitor({ currentUserId }: { currentUserId: string }) {
  const pathname = usePathname();
  const [status, setStatus] = useState<WorklogTrackerStatus | null>(null);
  /*
   * The desktop preload can attach `window.worklogDesktop` after React hydrates.
   * With an empty subscribe this was read exactly once, so any reload that beat
   * the bridge left this panel stuck on "open the desktop app" forever. Polling
   * briefly and then notifying React fixes that without a render loop.
   */
  const isDesktop = useSyncExternalStore(
    (onStoreChange) => {
      if (window.worklogDesktop) {
        return () => {};
      }

      let attempts = 0;
      const intervalId = window.setInterval(() => {
        if (window.worklogDesktop) {
          window.clearInterval(intervalId);
          onStoreChange();
          return;
        }

        if (++attempts >= 24) {
          window.clearInterval(intervalId);
        }
      }, 250);

      return () => window.clearInterval(intervalId);
    },
    () => Boolean(window.worklogDesktop),
    () => false,
  );

  useEffect(() => {
    const bridge = window.worklogDesktop;
    if (!bridge) return;

    // No auto-start here: whether monitoring should be running after a
    // reload or restart is decided by the main process against the backend's
    // attendance state (see screenshot-monitor.cjs `reconcile()`), not by
    // this component's mount timing. This only ever mirrors that state.
    void bridge.getTrackerStatus().then(setStatus);
    const unsubscribe = bridge.onTrackerStatus(setStatus);

    const onStart = (event: Event) => {
      const detail = (event as CustomEvent<{ source?: string; label?: string }>).detail;
      const source = detail?.source ?? "work";
      void bridge.startTracking({ source, label: detail?.label ?? "Work session", userId: currentUserId, taskId: source.replace(/^task:/, "") }).then(setStatus);
    };
    const onStop = (event: Event) => {
      const detail = (event as CustomEvent<{ source?: string }>).detail;
      void bridge.stopTracking({ source: detail?.source ?? "work" }).then(setStatus);
    };
    const onPause = () => void bridge.pauseTracking().then(setStatus);
    const onResume = () => void bridge.resumeTracking().then(setStatus);

    window.addEventListener("worklog:task-monitor-start", onStart);
    window.addEventListener("worklog:task-monitor-stop", onStop);
    window.addEventListener("worklog:task-monitor-pause", onPause);
    window.addEventListener("worklog:task-monitor-resume", onResume);
    return () => {
      unsubscribe();
      window.removeEventListener("worklog:task-monitor-start", onStart);
      window.removeEventListener("worklog:task-monitor-stop", onStop);
      window.removeEventListener("worklog:task-monitor-pause", onPause);
      window.removeEventListener("worklog:task-monitor-resume", onResume);
    };
    // isDesktop is a dependency so this wires up the moment the bridge appears,
    // not only when the component happened to mount after it.
  }, [currentUserId, isDesktop]);

  const statusLabel = !isDesktop
    ? "Open the WorkLog desktop app to enable native screenshots."
    : status?.paused
      ? "Paused for break — resumes automatically when the break ends."
      : status?.running
        ? `Monitoring active · every 5 min · ${status.pending} pending upload${status.pending === 1 ? "" : "s"}`
        : "Ready — Attendance Start begins capture.";

  // Keep the listener/effect layer mounted: task timers still need to reach the
  // native screenshot bridge. Only the old visual utility strip is removed from
  // the redesigned dashboard.
  if (pathname === "/dashboard") {
    return null;
  }

  return (
    <section
      className="dashboard-monitor-strip mt-2.5 shrink-0 rounded-xl border border-[var(--panel-border)] bg-[var(--panel)] px-2.5 py-1.5"
      data-page-section
    >
      {/* One compact line: this is a utility strip, not a panel — every pixel
          it gives back goes to the work plan above it. */}
      <div className="flex items-center gap-2.5">
        <span
          className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
            status?.paused
              ? "bg-amber-500/12 text-amber-500"
              : status?.running
                ? "bg-emerald-500/12 text-emerald-500"
                : "bg-slate-500/10 text-slate-500"
          }`}
        >
          <Camera className="h-3.5 w-3.5" />
        </span>
        <p className="shrink-0 text-[0.78rem] font-bold text-[var(--foreground)]">Screen Monitoring</p>
        <p className="min-w-0 flex-1 truncate text-[0.72rem] text-[var(--muted-foreground)]">{statusLabel}</p>
      </div>
    </section>
  );
}
