"use client";

import { Download } from "lucide-react";
import { useCallback } from "react";

/**
 * Downloads the report for whatever range the two date inputs are showing.
 *
 * A plain <Link> here would carry the range the server rendered with, which
 * drifts from the inputs the moment the user edits a date without pressing
 * View — and browsers also restore previous input values on a reload, so the
 * fields could show one range while the link pointed at another. Reading the
 * live field values at click time makes the download always match what the
 * user is looking at.
 */
export function ReportDownloadButton({
  fromInputId,
  toInputId,
  fallbackFrom,
  fallbackTo,
}: {
  fromInputId: string;
  toInputId: string;
  fallbackFrom: string;
  fallbackTo: string;
}) {
  const handleClick = useCallback(() => {
    const readField = (id: string, fallback: string) => {
      const field = document.getElementById(id);
      const value = field instanceof HTMLInputElement ? field.value.trim() : "";
      return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
    };

    const first = readField(fromInputId, fallbackFrom);
    const second = readField(toInputId, fallbackTo);
    // A backwards range is a slip, not an error worth blocking on.
    const from = first <= second ? first : second;
    const to = first <= second ? second : first;

    window.location.href = `/api/dashboard/report/export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  }, [fallbackFrom, fallbackTo, fromInputId, toInputId]);

  return (
    <button
      className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-[var(--panel-border)] bg-[var(--panel)] px-3.5 text-[0.82rem] font-semibold text-[var(--foreground)] transition hover:border-[#4f5ef7]/40 hover:bg-[var(--panel-alt)]"
      onClick={handleClick}
      type="button"
    >
      <Download className="h-3.5 w-3.5" />
      Download
    </button>
  );
}
