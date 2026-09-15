"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

export function TaskScreenshotMonitor({ currentUserId }: { currentUserId: string }) {
  const [, setStatus] = useState<WorklogTrackerStatus | null>(null);
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

  // Keep the existing native-bridge listeners mounted, without rendering a
  // Screen Monitoring section or reserving layout space on any page.
  return null;
}
