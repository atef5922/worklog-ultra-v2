"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Clock3, Coffee, LogIn, LogOut, X } from "lucide-react";

type Session = { id: string; start: string; end: string; reason: string | null };
export type AttendanceDetails = {
  date: string;
  employee: string;
  department: string;
  team: string;
  dayType: string;
  status: string;
  flags: string[];
  reason: string | null;
  firstIn: string;
  lastOut: string;
  counted: string;
  active: string;
  breakTime: string;
  outside: string;
  overtime: string;
  offDayWork: string;
  workSessions: Session[];
  breakSessions: Session[];
};

export function AttendanceDetailsButton({ details }: { details: AttendanceDetails }) {
  const metrics = [
    ["Counted work", details.counted],
    ["Active work", details.active],
    ["Break time", details.breakTime],
    ["Outside gap", details.outside],
    ["Overtime", details.overtime],
    ["Off-day work", details.offDayWork],
  ];

  return <Dialog.Root>
    <Dialog.Trigger asChild>
      <button className="rounded-md px-2 py-1 font-semibold text-indigo-600 transition hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500" type="button">Details</button>
    </Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/55 backdrop-blur-[2px]" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[min(84dvh,700px)] w-[min(690px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] shadow-[0_30px_80px_rgba(15,23,42,0.3)] outline-none">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--panel-border)] px-5 py-4">
          <div className="min-w-0">
            <Dialog.Title className="text-lg font-bold">Attendance details</Dialog.Title>
            <Dialog.Description className="mt-0.5 text-xs text-[var(--muted-foreground)]">{details.employee} · {details.date} · {details.department} / {details.team}</Dialog.Description>
          </div>
          <Dialog.Close aria-label="Close attendance details" className="rounded-lg p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--panel-muted)] hover:text-[var(--foreground)]"><X size={18} /></Dialog.Close>
        </div>
        <div className="min-h-0 space-y-4 overflow-y-auto p-5">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-indigo-50 px-2.5 py-1 font-semibold text-indigo-700">{details.status}</span>
            <span className="rounded-full border border-[var(--panel-border)] px-2.5 py-1">{details.dayType}</span>
            {details.flags.map(flag => <span key={flag} className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700">{flag}</span>)}
          </div>
          {details.reason && <p className="rounded-lg bg-[var(--panel-muted)] px-3 py-2 text-xs">Schedule note: {details.reason}</p>}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-[var(--panel-border)] p-3"><LogIn className="mb-1 text-emerald-600" size={17} /><p className="text-[0.68rem] text-[var(--muted-foreground)]">First In</p><strong className="text-xs">{details.firstIn}</strong></div>
            <div className="rounded-xl border border-[var(--panel-border)] p-3"><LogOut className="mb-1 text-rose-600" size={17} /><p className="text-[0.68rem] text-[var(--muted-foreground)]">Last Out</p><strong className="text-xs">{details.lastOut}</strong></div>
            {metrics.map(([label, value]) => <div key={label} className="rounded-xl border border-[var(--panel-border)] bg-[var(--panel-muted)]/40 p-3"><Clock3 className="mb-1 text-indigo-500" size={16} /><p className="text-[0.68rem] text-[var(--muted-foreground)]">{label}</p><strong className="text-sm">{value}</strong></div>)}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <section className="rounded-xl border border-[var(--panel-border)] p-3">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Clock3 size={16} className="text-indigo-600" /> Work sessions</h3>
              {details.workSessions.length ? <ol className="space-y-2">{details.workSessions.map((session, index) => <li key={session.id} className="rounded-lg bg-[var(--panel-muted)] p-2.5 text-xs"><span className="font-semibold">Session {index + 1}</span><p className="mt-1">{session.start} → {session.end}</p>{session.reason && <p className="mt-1 text-[var(--muted-foreground)]">{session.reason}</p>}</li>)}</ol> : <p className="text-xs text-[var(--muted-foreground)]">No work session recorded.</p>}
            </section>
            <section className="rounded-xl border border-[var(--panel-border)] p-3">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Coffee size={16} className="text-amber-600" /> Break sessions</h3>
              {details.breakSessions.length ? <ol className="space-y-2">{details.breakSessions.map((session, index) => <li key={session.id} className="rounded-lg bg-[var(--panel-muted)] p-2.5 text-xs"><span className="font-semibold">Break {index + 1}</span><p className="mt-1">{session.start} → {session.end}</p></li>)}</ol> : <p className="text-xs text-[var(--muted-foreground)]">No break session recorded.</p>}
            </section>
          </div>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
