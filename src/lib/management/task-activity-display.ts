import {formatDateTimeInDhaka, formatMinutes} from '@/lib/utils';

export type TaskActivityFact = {
  label: string;
  value: string;
};

export type TaskActivityDisplay = {
  title: string;
  description: string;
  tone: 'timer' | 'change' | 'complete' | 'reopen' | 'note';
  facts: TaskActivityFact[];
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function number(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function dateTime(value: unknown) {
  const raw = text(value);
  return raw ? formatDateTimeInDhaka(raw) : null;
}

function duration(milliseconds: unknown) {
  const value = number(milliseconds);
  return value === null ? null : formatMinutes(value / 60_000);
}

function addFact(facts: TaskActivityFact[], label: string, value: string | null) {
  if (value) facts.push({label, value});
}

function changed(from: unknown, to: unknown) {
  const before = text(from);
  const after = text(to);
  if (!after || before === after) return null;
  return before ? `${before} → ${after}` : after;
}

export function taskActivityDisplay(eventType: string, snapshot: unknown): TaskActivityDisplay {
  const data = record(snapshot);
  const before = record(data.before);
  const after = record(data.after);
  const facts: TaskActivityFact[] = [];

  switch (eventType) {
    case 'timer_started':
      addFact(facts, 'Workday', text(data.reportDate));
      addFact(facts, 'Started at', dateTime(data.sessionStartedAt) ?? dateTime(data.occurredAt));
      addFact(facts, 'Previously tracked', duration(data.trackedMilliseconds));
      return {title: 'Timer started', description: 'Work timer started for this task.', tone: 'timer', facts};
    case 'timer_paused':
      addFact(facts, 'Workday', text(data.reportDate));
      addFact(facts, 'Session duration', duration(data.deltaMilliseconds));
      addFact(facts, 'Total tracked', duration(data.trackedMilliseconds));
      return {title: 'Timer paused', description: 'The current work session was saved.', tone: 'timer', facts};
    case 'timer_reopened':
      addFact(facts, 'Workday', text(data.reportDate));
      addFact(facts, 'Tracked time retained', duration(data.trackedMilliseconds));
      return {title: 'Timer resumed after reopen', description: 'The task timer was made available for another work cycle.', tone: 'reopen', facts};
    case 'details_updated': {
      addFact(facts, 'Title', changed(before.title ?? data.title, after.taskTitle ?? after.title ?? data.newTitle));
      addFact(facts, 'Description', changed(before.description ?? data.description, after.taskDescription ?? after.description ?? data.newDescription));
      addFact(facts, 'Priority', changed(before.priority ?? data.priority, after.priority ?? data.newPriority));
      return {title: 'Task details updated', description: facts.length ? 'Task information was changed.' : 'Task information was saved.', tone: 'change', facts};
    }
    case 'planning_updated':
      addFact(facts, 'Project', changed(before.projectName, after.projectName));
      addFact(facts, 'Client', changed(before.clientName, after.clientName));
      addFact(facts, 'Deadline', changed(before.dueAt, after.dueAt));
      addFact(facts, 'Estimated time', changed(before.estimatedMinutes, after.estimatedMinutes));
      return {title: 'Task plan updated', description: 'Planning details or checklist items were changed.', tone: 'change', facts};
    case 'completed':
      addFact(facts, 'Progress', number(data.completionPercent) === null ? null : `${number(data.completionPercent)}%`);
      return {title: 'Task completed', description: 'The task was marked as completed.', tone: 'complete', facts};
    case 'reopened':
      addFact(facts, 'Previous completion', dateTime(data.previousCompletedAt));
      return {title: 'Task reopened', description: 'A new work cycle was opened for this task.', tone: 'reopen', facts};
    case 'note_updated':
      addFact(facts, 'Workday', text(data.reportDate));
      return {title: 'Work note updated', description: 'The daily work note was changed.', tone: 'note', facts};
    default:
      return {
        title: eventType.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase()),
        description: 'A task activity was recorded.',
        tone: 'note',
        facts,
      };
  }
}
