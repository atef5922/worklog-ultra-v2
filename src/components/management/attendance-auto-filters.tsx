"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, type ChangeEvent, type FormEvent, type ReactNode } from "react";

export function AttendanceAutoFilters({ children }: { children: ReactNode }) {
  const router = useRouter();
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (debounce.current) clearTimeout(debounce.current);
  }, []);

  function apply(form: HTMLFormElement) {
    if (!form.checkValidity()) return;
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form)) {
      const text = String(value).trim();
      if (text) params.set(key, text);
    }
    if ((params.get("from") ?? "") > (params.get("to") ?? "")) return;
    router.replace(`/management/attendance?${params.toString()}`, { scroll: false });
  }

  function onChange(event: ChangeEvent<HTMLFormElement>) {
    if (debounce.current) clearTimeout(debounce.current);
    const form = event.currentTarget;
    if (event.target.getAttribute("name") === "q") {
      debounce.current = setTimeout(() => apply(form), 350);
    } else {
      apply(form);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (debounce.current) clearTimeout(debounce.current);
    apply(event.currentTarget);
  }

  return <form aria-label="Attendance filters" className="grid gap-2 rounded-xl border border-[var(--panel-border)] bg-[var(--panel)] p-2.5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8" onChange={onChange} onSubmit={onSubmit}>
    {children}
  </form>;
}
