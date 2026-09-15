import {toDateOnly} from '@/lib/utils';

export type TimerState = {
  reportDate: Date;
  trackedMilliseconds: number;
  actualStart: Date | null;
  actualEnd: Date | null;
  runningStartedAt: Date | null;
};
export function timerDayEnd(day: string) {
  return new Date(new Date(`${day}T00:00:00+06:00`).getTime() + 86_400_000);
}
/** Preserve the existing daily timer boundary; attendance itself never stops at midnight. */
export function timerElapsed(state: TimerState, now: Date) {
  const end = Math.min(now.getTime(), timerDayEnd(toDateOnly(state.reportDate)).getTime());
  return state.trackedMilliseconds + (state.runningStartedAt ? Math.max(0, end - state.runningStartedAt.getTime()) : 0);
}
export function pauseTimerState(state: TimerState, now: Date): TimerState {
  if (!state.runningStartedAt) return {...state};
  const end = new Date(Math.max(state.runningStartedAt.getTime(), Math.min(now.getTime(), timerDayEnd(toDateOnly(state.reportDate)).getTime())));
  return {...state, trackedMilliseconds: timerElapsed(state, end), actualEnd: end, runningStartedAt: null};
}
export function startTimerState(state: TimerState, now: Date): TimerState {
  if (state.runningStartedAt) throw new Error('Task timer is already running.');
  if (toDateOnly(now) !== toDateOnly(state.reportDate)) throw new Error('Refresh the task for the current workday.');
  return {...state, actualStart: state.actualStart ?? now, actualEnd: null, runningStartedAt: now};
}
