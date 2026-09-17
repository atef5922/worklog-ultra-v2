"use client";

import { DateTimeInput } from "@/components/ui/date-time-input";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type Interval = { id?: string; startedAt: string; endedAt: string | null };
type RecordInput = { id: string; updatedAt: string; revision: string; legacyBreakMinutes: number; workSessions: Interval[]; breakSessions: Interval[] };
const field = "rounded-lg border border-[var(--panel-border)] bg-[var(--panel)] px-3 py-2 text-sm";
// datetime-local has no timezone. Display Dhaka, retaining seconds and milliseconds from the evidence.
const toLocal = (value: string | null) => value ? new Date(new Date(value).getTime() + 6 * 3600000).toISOString().slice(0, -1) : "";
const toInstant = (value: string) => {
  const date = new Date(`${value}+06:00`);
  if (!value || !Number.isFinite(date.getTime())) throw new Error("Enter valid start and end times for every session.");
  return date.toISOString();
};

export function AttendanceCorrection({ record }: { record: RecordInput }) {
  // A refreshed revision must never submit a draft based on the preceding record's evidence.
  return <CorrectionForm key={`${record.id}:${record.revision}`} record={record} />;
}

function CorrectionForm({ record }: { record: RecordInput }) {
  const router = useRouter();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [work, setWork] = useState(record.workSessions.map(s => ({ ...s, startedAt: toLocal(s.startedAt), endedAt: toLocal(s.endedAt) })));
  const [breaks, setBreaks] = useState(record.breakSessions.map(s => ({ ...s, startedAt: toLocal(s.startedAt), endedAt: toLocal(s.endedAt) })));
  const [reason, setReason] = useState(""), [closeOpenSessions, setCloseOpenSessions] = useState(false);
  const [legacy, setLegacy] = useState(record.legacyBreakMinutes);
  const hasOpen = [...record.workSessions, ...record.breakSessions].some(s => !s.endedAt);

  return <div className="mt-3">
    <button type="button" disabled={busy} className="text-sm font-semibold text-indigo-500" onClick={() => setOpen(!open)}>
      {hasOpen ? "Correct / close sessions" : "Correct attendance"}
    </button>
    {open && <form className="mt-3 space-y-3" onSubmit={async event => {
      event.preventDefault();
      if (saving.current) return;
      saving.current = true; setBusy(true);
      try {
        const map = (s: { id?: string; startedAt: string; endedAt: string }) => ({ ...s, startedAt: toInstant(s.startedAt), endedAt: toInstant(s.endedAt) });
        const response = await fetch("/api/management/attendance", {
          method: "PUT", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(15_000),
          body: JSON.stringify({ recordId: record.id, updatedAt: record.updatedAt, expectedRevision: record.revision,
            legacyBreakMinutes: legacy, reason, closeOpenSessions, workSessions: work.map(map), breakSessions: breaks.map(map) }),
        });
        const result = await response.json().catch(() => null);
        if (!response.ok) throw new Error(typeof result?.message === "string" ? result.message : "Correction failed. Refresh the record before retrying.");
        if (response.redirected || result?.record?.id !== record.id || !/^[a-f0-9]{64}$/.test(result?.revision ?? "")) {
          throw new Error("Correction could not be confirmed. Refresh the record before retrying.");
        }
        toast.success(result.message ?? "Attendance corrected."); setOpen(false); router.refresh();
      } catch (error) {
        toast.error(error instanceof Error && !["AbortError", "TimeoutError"].includes(error.name)
          ? error.message : "Correction confirmation timed out. Refresh the record before retrying.");
      } finally { saving.current = false; setBusy(false); }
    }}>
      <p className="text-xs text-[var(--muted-foreground)]">Times are Asia/Dhaka. Enter verified times; original values and your reason are preserved in the audit log.</p>
      {hasOpen && <p role="note" className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700">This record has running or stuck sessions. Supply an explicit end time for every session. Saving will close them; it will not automatically check the employee back in.</p>}
      <fieldset disabled={busy} className="space-y-3">
        {(["work", "break"] as const).map(kind => {
          const list = kind === "work" ? work : breaks, set = kind === "work" ? setWork : setBreaks;
          return <fieldset key={kind} className="space-y-2">
            <legend className="text-sm font-semibold">{kind === "work" ? "Office sessions" : "Break sessions"}</legend>
            {list.map((s, i) => <div key={s.id ?? i} className="flex flex-wrap gap-2">
              <DateTimeInput step="0.001" aria-label={`${kind} start ${i + 1}`} className={field} value={s.startedAt} required onValueChange={value => set(prev => prev.map((v, j) => j === i ? { ...v, startedAt: value } : v))} />
              <DateTimeInput step="0.001" aria-label={`${kind} end ${i + 1}`} className={field} value={s.endedAt} required onValueChange={value => set(prev => prev.map((v, j) => j === i ? { ...v, endedAt: value } : v))} />
            </div>)}
            <button className="text-xs text-indigo-500" disabled={list.length >= 50} type="button" onClick={() => set(prev => [...prev, { startedAt: "", endedAt: "" }])}>+ Add missing {kind} session</button>
          </fieldset>;
        })}
        <label className="block text-sm">Legacy break minutes <input type="number" min={0} max={1440} step={1} required className={field} value={legacy} onChange={e => setLegacy(e.target.valueAsNumber)} /></label>
        <textarea aria-label="Correction reason" className={`${field} w-full`} minLength={10} maxLength={1000} required value={reason} onChange={e => setReason(e.target.value)} placeholder="Explain why this correction is necessary" />
        {hasOpen && <label className="flex items-start gap-2 text-sm"><input type="checkbox" required checked={closeOpenSessions} onChange={e => setCloseOpenSessions(e.target.checked)} />I verified these times and confirm closing all open sessions on this record.</label>}
        <div className="flex gap-3">
          <button disabled={busy || (hasOpen && !closeOpenSessions)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white">{busy ? "Saving…" : "Save correction"}</button>
          <button type="button" className="text-sm text-indigo-500" onClick={() => router.refresh()}>Refresh record</button>
        </div>
      </fieldset>
    </form>}
  </div>;
}
