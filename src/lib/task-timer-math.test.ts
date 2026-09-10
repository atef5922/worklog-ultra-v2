import { describe, expect, it } from "vitest";
import {
  bankTaskTimerSegment,
  getNextDhakaMidnightTimestamp,
} from "@/lib/task-timer-math";

describe("task timer segment math", () => {
  it("excludes a pause gap from resumed work", () => {
    const firstSession = bankTaskTimerSegment(
      0,
      "2026-09-10T10:00:00+06:00",
      "2026-09-10T10:15:00+06:00",
    );
    const total = bankTaskTimerSegment(
      firstSession,
      "2026-09-10T10:30:00+06:00",
      "2026-09-10T10:45:00+06:00",
    );

    expect(firstSession).toBe(15 * 60);
    expect(total).toBe(30 * 60);
  });

  it("banks only the final pre-midnight segment", () => {
    const midnight = getNextDhakaMidnightTimestamp("2026-09-10");
    const total = bankTaskTimerSegment(
      0,
      "2026-09-10T23:50:00+06:00",
      midnight,
    );

    expect(new Date(midnight).toISOString()).toBe("2026-09-10T18:00:00.000Z");
    expect(total).toBe(10 * 60);
  });

  it("never subtracts time when a malformed stop precedes start", () => {
    expect(
      bankTaskTimerSegment(
        120,
        "2026-09-10T11:00:00+06:00",
        "2026-09-10T10:00:00+06:00",
      ),
    ).toBe(120);
  });
});
