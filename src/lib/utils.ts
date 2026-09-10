import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Client-safe unique id.
 *
 * `crypto.randomUUID` only exists in secure contexts, so it is missing whenever
 * the app is opened over plain http from another machine on the LAN. Falls back
 * to `getRandomValues`, then to a timestamp+random string.
 */
export function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function formatHours(minutes: number) {
  return `${(minutes / 60).toFixed(1)}h`;
}

export const STANDARD_WORK_DAYS_PER_WEEK = 6;
export const STANDARD_DAILY_HOURS = 9;
export const STANDARD_WORK_DAYS_PER_MONTH = 26;
export const WORKLOG_TIME_ZONE = "Asia/Dhaka";
const DHAKA_OFFSET = "+06:00";
const DHAKA_LOCAL_DATE_TIME_PATTERN = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

export function formatMinutes(minutes: number) {
  const safeMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const remainder = safeMinutes % 60;

  return `${hours}h ${String(remainder).padStart(2, "0")}m`;
}

export function calculateHourlyRate(monthlySalary?: number | string | null, expectedDailyHours?: number | string | null) {
  const salary = Number(monthlySalary ?? 0);
  const dailyHours = Number(expectedDailyHours ?? STANDARD_DAILY_HOURS);

  if (!salary || !dailyHours) {
    return 0;
  }

  return salary / STANDARD_WORK_DAYS_PER_MONTH / dailyHours;
}

export function calculateDailyRate(monthlySalary?: number | string | null) {
  const salary = Number(monthlySalary ?? 0);
  if (!salary) return 0;
  return salary / STANDARD_WORK_DAYS_PER_MONTH;
}

export function calculateWeeklyRate(monthlySalary?: number | string | null) {
  return calculateDailyRate(monthlySalary) * STANDARD_WORK_DAYS_PER_WEEK;
}

export function calculateWorkValue(
  trackedMinutes: number,
  monthlySalary?: number | string | null,
  expectedDailyHours?: number | string | null,
) {
  return calculateHourlyRate(monthlySalary, expectedDailyHours) * (trackedMinutes / 60);
}

export function calculateMinutesBetween(start?: Date | string | null, end?: Date | string | null) {
  if (!start || !end) return 0;
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();

  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
    return 0;
  }

  return Math.max(0, Math.round((endTime - startTime) / 60000));
}

export function calculateOvertimeMinutes(trackedMinutes: number, expectedDailyHours?: number | string | null) {
  const baseline = Number(expectedDailyHours ?? STANDARD_DAILY_HOURS) * 60;
  return Math.max(0, trackedMinutes - baseline);
}

export function calculateRegularMinutes(trackedMinutes: number, expectedDailyHours?: number | string | null) {
  const baseline = Number(expectedDailyHours ?? STANDARD_DAILY_HOURS) * 60;
  return Math.max(0, Math.min(trackedMinutes, baseline));
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

export function normalizeDhakaDateTimeValue(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(DHAKA_LOCAL_DATE_TIME_PATTERN);

  if (!match) {
    return trimmed;
  }

  const [, date, hour, minute, second = "00"] = match;
  return `${date}T${hour}:${minute}:${second}${DHAKA_OFFSET}`;
}

export function parseDhakaDateTime(value?: Date | string | null) {
  if (!value) {
    return null;
  }

  const parsedValue =
    typeof value === "string"
      ? new Date(normalizeDhakaDateTimeValue(value))
      : new Date(value);

  if (Number.isNaN(parsedValue.getTime())) {
    return null;
  }

  return parsedValue;
}

function getDhakaDateParts(value: Date | string = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: WORKLOG_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parsedValue = parseDhakaDateTime(value);
  const parts = formatter.formatToParts(parsedValue ?? new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour,
    minute: map.minute,
  };
}

export function toDateOnly(value: Date | string = new Date()) {
  const parts = getDhakaDateParts(value);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function toDateTimeInputValue(value: Date | string = new Date()) {
  if (typeof value === "string") {
    const match = value.trim().match(DHAKA_LOCAL_DATE_TIME_PATTERN);
    if (match) {
      const [, date, hour, minute] = match;
      return `${date}T${hour}:${minute}`;
    }
  }

  const parts = getDhakaDateParts(value);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function toDhakaOffsetIso(value: Date | string = new Date()) {
  const parts = getDhakaDateParts(value);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00+06:00`;
}

export function getDhakaCutoffIso(dayKey: string, hour = 19, minute = 30) {
  return `${dayKey}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+06:00`;
}

export function formatDateTimeInDhaka(value?: Date | string | null) {
  if (!value) return "Not set";
  const parsedValue = parseDhakaDateTime(value);

  if (!parsedValue) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-BD", {
    timeZone: WORKLOG_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(parsedValue);
}

export function formatTimeOnlyInDhaka(value?: Date | string | null) {
  if (!value) {
    return "Not set";
  }

  const parsedValue = parseDhakaDateTime(value);
  if (!parsedValue) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-BD", {
    timeZone: WORKLOG_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(parsedValue);
}

export function getGreetingInDhaka(value: Date | string = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: WORKLOG_TIME_ZONE,
    hour: "2-digit",
    hour12: false,
  });
  const hour = Number(formatter.format(new Date(value)));

  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 20) return "Good evening";
  return "Good night";
}

export function isTenderDepartmentName(value?: string | null) {
  return Boolean(value?.trim().toLowerCase().includes("tender"));
}

export function safeRedirect(pathname?: string | null) {
  if (!pathname || !pathname.startsWith("/")) {
    return "/dashboard";
  }

  return pathname;
}
