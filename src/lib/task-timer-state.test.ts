import {describe, expect, it} from 'vitest';
import {pauseTimerState, startTimerState, timerElapsed, type TimerState} from './task-timer-state';
const at = (time: string) => new Date(`2026-09-14T${time}+06:00`);
const seed = (): TimerState => ({reportDate: new Date('2026-09-14'), trackedMilliseconds: 0, actualStart: null, actualEnd: null, runningStartedAt: null});
describe('Server timer arithmetic', () => {
  it('preserves milliseconds across repeated pause/resume without counting paused gaps', () => {
    let state = pauseTimerState(startTimerState(seed(), at('10:00:00.250')), at('10:00:00.750'));
    state = pauseTimerState(startTimerState(state, at('11:00:00.000')), at('11:00:00.750'));
    expect(state.trackedMilliseconds).toBe(1250);
    expect(state.actualStart).toEqual(at('10:00:00.250'));
  });
  it('does not bank the same closed session twice', () => {
    const stopped = pauseTimerState(startTimerState(seed(), at('10:00:00')), at('10:01:00'));
    expect(pauseTimerState(stopped, at('11:00:00'))).toEqual(stopped);
  });
  it('recovers elapsed time from saved server state without a client cache', () => {
    const saved = startTimerState(seed(), at('10:00:00'));
    expect(timerElapsed(saved, at('10:30:00'))).toBe(1_800_000);
  });
  it('does not count backwards and retains the current midnight pause policy', () => {
    const saved = startTimerState(seed(), at('23:59:30'));
    expect(timerElapsed(saved, at('23:59:00'))).toBe(0);
    const stopped = pauseTimerState(saved, new Date('2026-09-15T04:00:00+06:00'));
    expect(stopped.trackedMilliseconds).toBe(30_000);
    expect(stopped.actualEnd).toEqual(new Date('2026-09-15T00:00:00+06:00'));
  });
  it('prevents a second Start or a new Start on a historical date', () => {
    expect(() => startTimerState(startTimerState(seed(), at('10:00:00')), at('11:00:00'))).toThrow();
    expect(() => startTimerState(seed(), new Date('2026-09-15T10:00:00+06:00'))).toThrow();
  });
});
