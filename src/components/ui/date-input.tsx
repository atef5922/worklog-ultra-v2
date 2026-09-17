"use client";

import { CalendarDays } from "lucide-react";
import { useRef, useState, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type DateInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue" | "onChange" | "min" | "max"> & {
  value?: string;
  defaultValue?: string;
  min?: string;
  max?: string;
  onValueChange?: (value: string) => void;
};

export function formatInputDate(value?: string) {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

export function parseInputDate(value: string) {
  if (!value) return "";
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  const date = new Date(`${iso}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
}

export function DateInput({
  value,
  defaultValue,
  min,
  max,
  onValueChange,
  className,
  name,
  disabled,
  required,
  ...props
}: DateInputProps) {
  const controlled = value !== undefined;
  const [localValue, setLocalValue] = useState(defaultValue ?? "");
  const isoValue = controlled ? value : localValue;
  const [edit, setEdit] = useState<{ source: string; text: string } | null>(null);
  const displayValue = edit?.source === isoValue ? edit.text : formatInputDate(isoValue);
  const textRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);

  function setDate(iso: string) {
    setEdit(null);
    if (pickerRef.current) pickerRef.current.value = iso;
    if (!controlled) setLocalValue(iso);
    onValueChange?.(iso);
  }

  function handleTextChange(raw: string) {
    setEdit({ source: isoValue, text: raw });
    const iso = parseInputDate(raw);
    const outOfRange = iso !== null && iso !== "" && ((min && iso < min) || (max && iso > max));
    textRef.current?.setCustomValidity(iso === null ? "Enter a valid date as DD/MM/YYYY." : outOfRange ? "Date is outside the allowed range." : "");
    if (iso !== null && !outOfRange) setDate(iso);
  }

  return (
    <span className="relative inline-flex w-full min-w-0 items-center">
      <input
        {...props}
        ref={textRef}
        className={cn("h-11 w-full min-w-0 rounded-lg border bg-[var(--input)] px-3 pr-9 text-sm text-[var(--foreground)] focus:border-[var(--ring)]", className)}
        disabled={disabled}
        inputMode="numeric"
        maxLength={10}
        onChange={(event) => handleTextChange(event.target.value)}
        onBlur={() => {
          const iso = parseInputDate(displayValue);
          if (iso && (!min || iso >= min) && (!max || iso <= max)) setEdit(null);
        }}
        pattern="[0-9]{2}/[0-9]{2}/[0-9]{4}"
        placeholder="DD/MM/YYYY"
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
        max={max}
        min={min}
        name={name}
        onChange={(event) => {
          setEdit(null);
          textRef.current?.setCustomValidity("");
          setDate(event.target.value);
        }}
        tabIndex={-1}
        type="date"
        value={isoValue}
      />
      <button
        aria-label="Choose date"
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