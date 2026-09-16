"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CircleStop, LoaderCircle, UsersRound } from "lucide-react";

export function EmployeePresence() {
  const [meeting, setMeeting] = useState(false);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const requestVersion = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    const beat = async () => {
      if (pending || saving.current) return;
      pending = true;
      const version = requestVersion.current;
      try {
        const response = await fetch("/api/dashboard/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "heartbeat" }),
          signal: controller.signal,
        });
        if (response.ok) {
          const data = await response.json();
          // An older heartbeat must not undo a just-completed button click.
          if (!controller.signal.aborted && !saving.current && version === requestVersion.current) {
            setMeeting(Boolean(data.presence?.meetingStartedAt));
          }
        }
      } catch {
        // A transient heartbeat error must not alter the displayed meeting state.
      } finally {
        pending = false;
      }
    };
    void beat();
    const interval = window.setInterval(() => void beat(), 30_000);
    window.addEventListener("focus", beat);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", beat);
    };
  }, []);

  async function toggle() {
    if (saving.current) return;
    saving.current = true;
    requestVersion.current += 1;
    setBusy(true);
    const action = meeting ? "meeting_end" : "meeting_start";
    try {
      const response = await fetch("/api/dashboard/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Meeting status could not be saved.");
      setMeeting(Boolean(data.presence.meetingStartedAt));
      toast.success(action === "meeting_end" ? "Meeting ended." : "Meeting started.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Meeting status could not be saved.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      aria-label={meeting ? "End meeting" : "Start meeting"}
      aria-pressed={meeting}
      aria-busy={busy}
      title={busy ? "Saving meeting status" : meeting ? "In meeting - End meeting" : "Start meeting"}
      data-meeting-control
      disabled={busy}
      onClick={toggle}
      className={`button-force-white inline-flex h-11 w-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg border text-[0.8125rem] font-semibold leading-none text-white shadow-[0_2px_8px_rgba(0,0,0,0.18)] transition-[background-color,border-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#06174b] disabled:cursor-wait disabled:opacity-100 disabled:shadow-none sm:w-auto sm:min-w-[9rem] sm:px-3 min-[900px]:h-9 ${meeting ? "border-[#34d399]/50 bg-[#047857] hover:bg-[#065f46] active:bg-[#064e3b]" : "border-[#93c5fd]/50 bg-[#2563eb] hover:bg-[#1d4ed8] active:bg-[#1e40af]"}`}
    >
      {busy ? (
        <LoaderCircle aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" />
      ) : meeting ? (
        <CircleStop aria-hidden="true" className="h-4 w-4 shrink-0" />
      ) : (
        <UsersRound aria-hidden="true" className="h-4 w-4 shrink-0" />
      )}
      <span className="hidden sm:inline">{busy ? "Saving..." : meeting ? "End meeting" : "Start meeting"}</span>
    </button>
  );
}
