"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { toDateOnly } from "@/lib/utils";

type Option = { id: string; name: string };

export function AttendanceDayOverrideForm({
  employees, departments, allowCompany,
}: {
  employees: Option[];
  departments: Option[];
  allowCompany: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState(toDateOnly());
  const [subject, setSubject] = useState(employees[0] ? `employee:${employees[0].id}` : allowCompany ? "company" : "");
  const [kind, setKind] = useState("off");
  const [reason, setReason] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !subject) return;
    const [subjectType, subjectId] = subject === "company" ? ["company", null] : subject.split(":");
    setBusy(true);
    try {
      const response = await fetch("/api/management/attendance/day-override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, subjectType, subjectId, kind, reason }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Could not save attendance day.");
      toast.success(result.message);
      setReason("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save attendance day.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="rounded-xl border border-[var(--panel-border)] bg-[var(--panel)] p-3">
    <h2 className="font-semibold">Dated off day or leave exception</h2>
    <p className="mt-1 text-xs text-[var(--muted-foreground)]">Friday is off by default. Set a specific workday, another off day, or employee leave with an audited reason. This does not edit In/Out evidence or approve payable overtime.</p>
    <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-2 text-xs">
      <label className="flex flex-col gap-1">Date<input type="date" required value={date} onChange={event => setDate(event.target.value)} className="rounded-lg border border-[var(--panel-border)] bg-[var(--panel)] p-2" /></label>
      <label className="flex min-w-52 flex-col gap-1">Applies to<select required value={subject} onChange={event => { const next = event.target.value; setSubject(next); if (!next.startsWith("employee:") && kind === "leave") setKind("off"); }} className="rounded-lg border border-[var(--panel-border)] bg-[var(--panel)] p-2">
        <option value="">Select a subject</option>
        {allowCompany && <option value="company">Full company</option>}
        {departments.map(item => <option key={item.id} value={`department:${item.id}`}>{item.name} department</option>)}
        {employees.map(item => <option key={item.id} value={`employee:${item.id}`}>{item.name}</option>)}
      </select></label>
      <label className="flex flex-col gap-1">Day type<select value={kind} onChange={event => setKind(event.target.value)} className="rounded-lg border border-[var(--panel-border)] bg-[var(--panel)] p-2">
        <option value="off">Off day</option><option value="workday">Workday (including Friday)</option>
        {subject.startsWith("employee:") && <option value="leave">Approved leave</option>}
        <option value="clear">Remove existing exception</option>
      </select></label>
      <label className="flex min-w-64 flex-1 flex-col gap-1">Reason<input required minLength={10} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} placeholder="Why is this day different?" className="rounded-lg border border-[var(--panel-border)] bg-[var(--panel)] p-2" /></label>
      <button disabled={busy || !subject} className="rounded-lg bg-indigo-600 px-3 py-2 font-semibold text-white disabled:opacity-50">{busy ? "Saving..." : "Save day"}</button>
    </form>
  </section>;
}
