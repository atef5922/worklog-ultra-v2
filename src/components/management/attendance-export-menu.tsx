"use client";

import { useEffect, useRef } from "react";

type AttendanceExportMenuProps = {
  summaryExcelHref: string;
  summaryPdfHref: string;
  detailedExcelHref: string;
  detailedPdfHref: string;
};

export function AttendanceExportMenu({
  summaryExcelHref,
  summaryPdfHref,
  detailedExcelHref,
  detailedPdfHref,
}: AttendanceExportMenuProps) {
  const menuRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function closeOnOutsidePointer(event: PointerEvent) {
      const menu = menuRef.current;
      if (menu?.open && !menu.contains(event.target as Node)) menu.open = false;
    }

    function closeOnEscape(event: KeyboardEvent) {
      const menu = menuRef.current;
      if (event.key === "Escape" && menu?.open) {
        menu.open = false;
        menu.querySelector("summary")?.focus();
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <details ref={menuRef} className="relative z-20">
      <summary className="cursor-pointer rounded-lg border border-[var(--panel-border)] bg-[var(--panel)] px-2.5 py-1.5 font-medium">Export report</summary>
      <div className="absolute right-0 top-full mt-1 flex w-48 flex-col rounded-lg border border-[var(--panel-border)] bg-[var(--panel)] p-1 shadow-lg">
        <a className="rounded px-2 py-1.5 hover:bg-slate-100" href={summaryExcelHref}>Summary Excel</a>
        <a className="rounded px-2 py-1.5 hover:bg-slate-100" href={summaryPdfHref}>Summary PDF</a>
        <a className="rounded px-2 py-1.5 hover:bg-slate-100" href={detailedExcelHref}>Summary + day-wise Excel</a>
        <a className="rounded px-2 py-1.5 hover:bg-slate-100" href={detailedPdfHref}>Summary + day-wise PDF</a>
      </div>
    </details>
  );
}