import {describe, expect, it} from 'vitest';
import {taskActivityDisplay} from './task-activity-display';

describe('taskActivityDisplay', () => {
  it('shows useful timer information without exposing internal metadata', () => {
    const display = taskActivityDisplay('timer_started', {
      commandId: 'internal-command',
      timerSchema: 1,
      version: 2,
      reportDate: '2026-09-15',
      sessionStartedAt: '2026-09-15T05:26:47.270Z',
      trackedMilliseconds: 0,
    });

    expect(display.title).toBe('Timer started');
    expect(JSON.stringify(display)).not.toContain('internal-command');
    expect(JSON.stringify(display)).not.toContain('timerSchema');
    expect(JSON.stringify(display)).not.toContain('version');
  });

  it('formats a paused session and total tracked duration', () => {
    const display = taskActivityDisplay('timer_paused', {
      deltaMilliseconds: 45 * 60_000,
      trackedMilliseconds: 135 * 60_000,
    });

    expect(display.facts).toContainEqual({label: 'Session duration', value: '0h 45m'});
    expect(display.facts).toContainEqual({label: 'Total tracked', value: '2h 15m'});
  });

  it('lists only changed task details', () => {
    const display = taskActivityDisplay('details_updated', {
      before: {title: 'Old title', description: 'Same', priority: 'normal'},
      after: {taskTitle: 'New title', taskDescription: 'Same', priority: 'high'},
    });

    expect(display.facts).toEqual([
      {label: 'Title', value: 'Old title → New title'},
      {label: 'Priority', value: 'normal → high'},
    ]);
  });
});
