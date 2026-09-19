"use client";

import { useState, useTransition, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DateInput } from "@/components/ui/date-input";

export function HistoryDateFilter({ from, to, today, children }: {
  from: string;
  to: string;
  today: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [dates, setDates] = useState({ from, to });
  const [pending, startTransition] = useTransition();
  const invalid = !dates.from || !dates.to || dates.from > dates.to;

  function changeDate(field: "from" | "to", value: string) {
    const next = { ...dates, [field]: value };
    setDates(next);
    if (!next.from || !next.to || next.from > next.to) return;
    startTransition(() => {
      router.replace(`${pathname}?${new URLSearchParams(next)}`, { scroll: false });
    });
  }

  return (
    <>
      <div className="shrink-0 rounded-xl border border-[var(--panel-border)] bg-[var(--panel)] p-3 sm:px-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:gap-3">
          <div className="grid w-full min-w-0 grid-cols-2 gap-3 sm:max-w-md sm:flex-1">
            {(["from", "to"] as const).map((field) => (
              <label className="min-w-0 space-y-1.5 text-xs font-medium text-[var(--muted-foreground)]" key={field}>
                <span>{field === "from" ? "From" : "To"}</span>
                <DateInput
                  aria-label={`History ${field} date`}
                  name={field}
                  value={dates[field]}
                  max={today}
                  required
                  className="h-9 border-[var(--panel-border)]"
                  onValueChange={(value) => changeDate(field, value)}
                />
              </label>
            ))}
          </div>
          <p aria-live="polite" className="text-xs sm:pb-2 text-[var(--muted-foreground)]">
            {invalid ? "Choose a valid start and end date in order." : pending ? "Updating history…" : "Updates automatically when dates change."}
          </p>
        </div>
      </div>
      <div aria-busy={pending} className={`flex min-h-0 flex-1 flex-col ${pending || invalid ? "opacity-50" : ""}`}>
        {children}
      </div>
    </>
  );
}
