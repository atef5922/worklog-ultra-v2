import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatHours(minutes: number) {
  return `${(minutes / 60).toFixed(1)}h`;
}

export const STANDARD_WORK_DAYS_PER_WEEK = 6;
export const STANDARD_DAILY_HOURS = 8;
export const STANDARD_WORK_DAYS_PER_MONTH = 26;
export const WORKLOG_TIME_ZONE = "Asia/Dhaka";

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

  const parts = formatter.formatToParts(new Date(value));
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
  const parts = getDhakaDateParts(value);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function toDhakaOffsetIso(value: Date | string = new Date()) {
  const parts = getDhakaDateParts(value);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00+06:00`;
}

export function formatDateTimeInDhaka(value?: Date | string | null) {
  if (!value) return "Not set";

  return new Intl.DateTimeFormat("en-BD", {
    timeZone: WORKLOG_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));
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

export function safeRedirect(pathname?: string | null) {
  if (!pathname || !pathname.startsWith("/")) {
    return "/dashboard";
  }

  return pathname;
}
