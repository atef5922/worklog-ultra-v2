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
  const handleClick = useCallback((format: "pdf" | "xlsx") => {
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

    window.location.href = `/api/dashboard/report/download?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&format=${format}`;
  }, [fallbackFrom, fallbackTo, fromInputId, toInputId]);

  return (
    <div className="flex items-center gap-1.5">
      <button
        className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3.5 text-[0.82rem] font-semibold text-emerald-700 transition hover:border-emerald-500/40 hover:bg-emerald-500/15"
        onClick={() => handleClick("xlsx")}
        type="button"
      >
        <Download className="h-3.5 w-3.5" />
        Excel
      </button>
      <button
        className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 text-[0.82rem] font-semibold text-rose-600 transition hover:border-rose-500/40 hover:bg-rose-500/15"
        onClick={() => handleClick("pdf")}
        type="button"
      >
        <Download className="h-3.5 w-3.5" />
        PDF
      </button>
    </div>
  );
}
