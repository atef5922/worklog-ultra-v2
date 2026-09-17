"use client";

import { CalendarDays } from "lucide-react";
import { useRef, useState, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { formatInputDate, parseInputDate } from "./date-input";

type DateTimeInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue" | "onChange"> & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
};

export function formatInputDateTime(value?: string) {
  const match = value?.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)$/);
  return match ? `${formatInputDate(match[1])} ${match[2]}` : "";
}

export function parseInputDateTime(value: string) {
  if (!value) return "";
  const match = value.match(/^(\d{2}\/\d{2}\/\d{4}) (\d{2}):(\d{2})(?::(\d{2})(\.\d{1,3})?)?$/);
  if (!match) return null;
  const date = parseInputDate(match[1]);
  if (!date || Number(match[2]) > 23 || Number(match[3]) > 59 || (match[4] && Number(match[4]) > 59)) return null;
  return `${date}T${match[2]}:${match[3]}${match[4] ? `:${match[4]}${match[5] ?? ""}` : ""}`;
}

export function DateTimeInput({ value, defaultValue, onValueChange, className, name, disabled, required, step, ...props }: DateTimeInputProps) {
  const controlled = value !== undefined;
  const [localValue, setLocalValue] = useState(defaultValue ?? "");
  const isoValue = controlled ? value : localValue;
  const [edit, setEdit] = useState<{ source: string; text: string } | null>(null);
  const displayValue = edit?.source === isoValue ? edit.text : formatInputDateTime(isoValue);
  const textRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);

  function setDateTime(next: string) {
    setEdit(null);
    if (pickerRef.current) pickerRef.current.value = next;
    if (!controlled) setLocalValue(next);
    onValueChange?.(next);
  }

  return (
    <span className="relative inline-flex w-full min-w-0 items-center">
      <input
        {...props}
        ref={textRef}
        className={cn("h-11 w-full min-w-0 rounded-lg border bg-[var(--input)] px-3 pr-9 text-sm text-[var(--foreground)] focus:border-[var(--ring)]", className)}
        disabled={disabled}
        inputMode="numeric"
        maxLength={23}
        onChange={(event) => {
          const raw = event.target.value;
          setEdit({ source: isoValue, text: raw });
          const parsed = parseInputDateTime(raw);
          textRef.current?.setCustomValidity(parsed === null ? "Enter a valid date and time as DD/MM/YYYY HH:mm." : "");
          if (parsed !== null) setDateTime(parsed);
        }}
        pattern="[0-9]{2}/[0-9]{2}/[0-9]{4} [0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]{1,3})?)?"
        placeholder="DD/MM/YYYY HH:mm"
        required={required}
        spellCheck={false}
        type="text"
        value={displayValue}
      />
      <input
        ref={pickerRef}
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 right-0 size-px opacity-0"
        disabled={disabled}
        name={name}
        onChange={(event) => {
          setEdit(null);
          textRef.current?.setCustomValidity("");
          setDateTime(event.target.value);
        }}
        step={step}
        tabIndex={-1}
        type="datetime-local"
        value={isoValue}
      />
      <button
        aria-label="Choose date and time"
        className="absolute right-2 flex items-center justify-center text-[var(--muted-foreground)]"
        disabled={disabled}
        onClick={() => {
          const picker = pickerRef.current;
          if (!picker) return;
          if (typeof picker.showPicker === "function") picker.showPicker();
          else picker.click();
        }}
        type="button"
      >
        <CalendarDays aria-hidden="true" size={16} />
      </button>
    </span>
  );
}