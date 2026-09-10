const MAX_DAILY_TIMER_SECONDS = 24 * 60 * 60;

function toTimestamp(value: Date | string | number) {
  if (typeof value === "number") return value;
  return new Date(value).getTime();
}

/**
 * Banks one running segment onto already-saved daily seconds.
 * Paused time is intentionally absent: every Resume gets a new segment start.
 */
export function bankTaskTimerSegment(
  bankedSeconds: number,
  runningStartedAt: Date | string | number,
  stoppedAt: Date | string | number,
) {
  const safeBase = Math.max(0, Number.isFinite(bankedSeconds) ? bankedSeconds : 0);
  const start = toTimestamp(runningStartedAt);
  const stop = toTimestamp(stoppedAt);
  const segmentSeconds =
    Number.isFinite(start) && Number.isFinite(stop)
      ? Math.max(0, Math.floor((stop - start) / 1000))
      : 0;

  return Math.min(MAX_DAILY_TIMER_SECONDS, safeBase + segmentSeconds);
}

export function getNextDhakaMidnightTimestamp(reportDate: string) {
  const dayStart = new Date(`${reportDate}T00:00:00+06:00`).getTime();
  return Number.isFinite(dayStart)
    ? dayStart + MAX_DAILY_TIMER_SECONDS * 1000
    : Number.NaN;
}
