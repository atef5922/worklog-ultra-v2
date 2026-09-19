"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ReportDownloadButton } from "@/components/dashboard/report-download-button";
import { DateInput } from "@/components/ui/date-input";

const dateFieldClass =
  "h-9 w-full rounded-xl border border-[var(--panel-border)] bg-[var(--panel-muted)] px-2.5 text-[0.8rem] text-[var(--foreground)] outline-none transition focus:border-[#4f5ef7]";
const fieldLabelClass =
  "mb-1 block text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[var(--muted-foreground)]";

export function ReportDateFilter({ from, to }: { from: string; to: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [dates, setDates] = useState({ from, to });
  const [pending, startTransition] = useTransition();

  function changeDate(field: "from" | "to", value: string) {
    if (!value) return;

    const next = { ...dates, [field]: value };
    if (field === "from" && next.from > next.to) next.to = next.from;
    if (field === "to" && next.to < next.from) next.from = next.to;
    setDates(next);

    startTransition(() => {
      router.replace(`${pathname}?${new URLSearchParams(next).toString()}`, { scroll: false });
    });
  }

  return (
    <div
      aria-busy={pending}
      className="grid grid-cols-2 gap-2 sm:grid-cols-[9rem_9rem_auto] sm:items-end"
    >
      <div>
        <label className={fieldLabelClass} htmlFor="report-from">From</label>
        <DateInput
          aria-label="Report from date"
          className={dateFieldClass}
          id="report-from"
          name="from"
          onValueChange={(value) => changeDate("from", value)}
          value={dates.from}
        />
      </div>
      <div>
        <label className={fieldLabelClass} htmlFor="report-to">To</label>
        <DateInput
          aria-label="Report to date"
          className={dateFieldClass}
          id="report-to"
          name="to"
          onValueChange={(value) => changeDate("to", value)}
          value={dates.to}
        />
      </div>
      <div className={`col-span-2 transition-opacity sm:col-span-1 ${pending ? "opacity-60" : ""}`}>
        <ReportDownloadButton
          fallbackFrom={dates.from}
          fallbackTo={dates.to}
          fromInputId="report-from"
          toInputId="report-to"
        />
      </div>
    </div>
  );
}
