import { describe, expect, it } from "vitest";
import { formatInputDate, parseInputDate } from "./date-input";
import { formatInputDateTime, parseInputDateTime } from "./date-time-input";
import { formatDateInDhaka, formatDateTimeInDhaka } from "@/lib/utils";

describe("day-first date presentation", () => {
  it("formats date-only keys and Dhaka timestamps as DD/MM/YYYY", () => {
    expect(formatDateInDhaka("2026-09-17")).toBe("17/09/2026");
    expect(formatDateInDhaka("2026-09-16T19:30:00Z")).toBe("17/09/2026");
    expect(formatDateTimeInDhaka("2026-09-16T19:30:00Z")).toMatch(/^17\/09\/2026, 01:30 am$/i);
  });

  it("keeps ISO values for filters while showing day first", () => {
    expect(formatInputDate("2026-09-17")).toBe("17/09/2026");
    expect(parseInputDate("17/09/2026")).toBe("2026-09-17");
    expect(parseInputDate("31/02/2026")).toBeNull();
    expect(parseInputDate("09/17/2026")).toBeNull();
  });

  it("preserves local time precision in attendance corrections", () => {
    expect(formatInputDateTime("2026-09-17T10:35:12.123")).toBe("17/09/2026 10:35:12.123");
    expect(parseInputDateTime("17/09/2026 10:35:12.123")).toBe("2026-09-17T10:35:12.123");
    expect(parseInputDateTime("17/09/2026 25:35")).toBeNull();
  });
});