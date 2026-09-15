import 'server-only';
import {createHash} from 'node:crypto';
import {Prisma, type TaskStatus} from '@prisma/client';
import {z} from 'zod';
import {NextResponse} from 'next/server';
import {db} from '@/lib/db';
import {getServerAuthContext} from '@/lib/auth/server';
import {AccessError, checkOrigin, fail, freshActor} from '@/lib/management/server';
import {readChecklist, taskProgress} from '@/lib/management/task-insights';
import {toDateOnly} from '@/lib/utils';
import {pauseTimerState, startTimerState, timerDayEnd, timerElapsed, type TimerState} from '@/lib/task-timer-state';

export const timerTaskInclude = {
  updates: {orderBy: [{reportDate: 'desc'}, {updatedAt: 'desc'}]},
  timerStates: {orderBy: {reportDate: 'desc'}},
} as const satisfies Prisma.DailyTaskInclude;
export type TimerTask = Prisma.DailyTaskGetPayload<{include: typeof timerTaskInclude}>;
const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(day => {
  const date = new Date(day); return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day;
});
export const timerCommandSchema = z.object({
  expectedUserId: z.string().uuid(), reportDate: daySchema,
  expectedRevision: z.string().regex(/^[a-f0-9]{64}$/), commandId: z.string().uuid(),
});

export function taskTimerRevision(task: TimerTask, day: string) {
  const last = task.updates[0];
  return createHash('sha256').update(JSON.stringify({taskId: task.id, day,
    latest: last ? [last.id, last.reportDate, last.status, last.trackedMinutes, last.actualStart, last.actualEnd, last.updatedAt] : null,
    states: task.timerStates.map(s => [s.id, s.version, s.reportDate]).sort((a,b) => String(a[0]).localeCompare(String(b[0]))),
  })).digest('hex');
}
export function stateForDay(task: TimerTask, day: string): TimerState {
  const saved = task.timerStates.find(s => toDateOnly(s.reportDate) === day);
  if (saved) return {reportDate:saved.reportDate,trackedMilliseconds:saved.trackedMilliseconds,actualStart:saved.actualStart,actualEnd:saved.actualEnd,runningStartedAt:saved.runningStartedAt};
  const update = task.updates.find(u => toDateOnly(u.reportDate) === day);
  // Only saved legacy minutes are imported. A browser cache cannot create worked time.
  return {reportDate: new Date(day), trackedMilliseconds: (update?.trackedMinutes ?? 0) * 60_000,
    actualStart: update?.actualStart ?? null, actualEnd: update?.actualEnd ?? null, runningStartedAt: null};
}
export async function taskAttendanceRunning(tx: Prisma.TransactionClient | typeof db, userId: string) {
  const records = await tx.attendanceRecord.findMany({where: {userId, workSessions: {some: {endedAt: null}}},
    include: {workSessions: {where: {endedAt: null}}, breakSessions: {where: {endedAt: null}}}});
  return records.length === 1 && records[0].workSessions.length === 1 && records[0].breakSessions.length === 0;
}
export function taskTimerSnapshot(task: TimerTask, day: string, now: Date, attendanceRunning: boolean) {
  const original = stateForDay(task, day);
  const state = now >= timerDayEnd(day) ? pauseTimerState(original, now) : original;
  const update = task.updates.find(u => toDateOnly(u.reportDate) <= day);
  const saved = task.timerStates.find(s => toDateOnly(s.reportDate) === day);
  const status = update?.status ?? 'pending';
  return {taskId: task.id, userId: task.userId, reportDate: day, revision: taskTimerRevision(task, day),
    status, note:update?.note??null, trackedMilliseconds: timerElapsed(state, now), actualStart: state.actualStart?.toISOString() ?? null,
    actualEnd: state.actualEnd?.toISOString() ?? null, runningStartedAt: status === 'done' ? null : state.runningStartedAt?.toISOString() ?? null,
    serverNow: now.toISOString(), canStart: day === toDateOnly(now) && task.planDate <= new Date(day) && status !== 'done' && attendanceRunning,
    lastCommandId: saved?.lastCommandId ?? null, lastAction: saved?.lastAction ?? null};
}

/** Called only while holding the employee row followed by the task row lock. */
export async function writeTaskTimerState(tx: Prisma.TransactionClient, task: TimerTask, state: TimerState,
  action: string, commandId: string | null, now: Date, status: TaskStatus = 'in_progress', actorId = task.userId) {
  state = {reportDate:state.reportDate,trackedMilliseconds:state.trackedMilliseconds,actualStart:state.actualStart,actualEnd:state.actualEnd,runningStartedAt:state.runningStartedAt};
  const day = toDateOnly(state.reportDate), before = stateForDay(task, day);
  if (!Number.isSafeInteger(state.trackedMilliseconds) || state.trackedMilliseconds < 0 || state.trackedMilliseconds > 86_400_000) {
    throw new AccessError('Stored task time needs review before this action can be saved.', 409);
  }
  const saved = await tx.taskTimerState.upsert({where: {taskId_reportDate: {taskId: task.id, reportDate: state.reportDate}},
    create: {taskId: task.id, ...state, version: 1, lastCommandId: commandId, lastAction: action},
    update: {...state, version: {increment: 1}, lastCommandId: commandId, lastAction: action}});
  const update = await tx.dailyTaskUpdate.upsert({where: {dailyTaskId_reportDate: {dailyTaskId: task.id, reportDate: state.reportDate}},
    create: {dailyTaskId: task.id, reportDate: state.reportDate, status, completionPercent: taskProgress(status, readChecklist(task.checklist)) ?? 0,
      trackedMinutes: Math.floor(timerElapsed(state, now) / 60_000), actualStart: state.actualStart, actualEnd: state.actualEnd},
    update: {status, completionPercent: taskProgress(status, readChecklist(task.checklist)) ?? 0,
      trackedMinutes: Math.floor(timerElapsed(state, now) / 60_000), actualStart: state.actualStart, actualEnd: state.actualEnd}});
  await tx.taskTimelineEntry.create({data: {taskId: task.id, actorId,
    eventType: action === 'start' ? 'timer_started' : action === 'reopen' ? 'timer_reopened' : 'timer_paused',
    snapshot: {timerSchema: 1, action, commandId, reportDate: day, version: saved.version,
      trackedMilliseconds: state.trackedMilliseconds, deltaMilliseconds: state.trackedMilliseconds - before.trackedMilliseconds,
      sessionStartedAt: (action === 'start' ? state.runningStartedAt : before.runningStartedAt)?.toISOString() ?? null,
      sessionEndedAt: state.actualEnd?.toISOString() ?? null, occurredAt: now.toISOString()}}});
  task.timerStates = [saved, ...task.timerStates.filter(s => s.id !== saved.id)];
  task.updates = [update, ...task.updates.filter(u => u.id !== update.id)].sort((a,b) => b.reportDate.getTime() - a.reportDate.getTime());
}
export async function settlePastTaskTimers(tx: Prisma.TransactionClient, task: TimerTask, now: Date) {
  for (const state of [...task.timerStates]) if (state.runningStartedAt && now >= timerDayEnd(toDateOnly(state.reportDate))) {
    await writeTaskTimerState(tx, task, pauseTimerState(state, now), 'midnight', null, now);
  }
}
export async function pauseUserTaskTimers(tx: Prisma.TransactionClient, userId: string, now: Date, reason: string, actorId = userId) {
  const candidates = await tx.dailyTask.findMany({where: {userId, timerStates: {some: {runningStartedAt: {not: null}}}}, select: {id: true}, orderBy: {id: 'asc'}});
  for (const candidate of candidates) {
    await tx.$queryRaw`SELECT id FROM daily_tasks WHERE id=${candidate.id}::uuid FOR UPDATE`;
    const task = await tx.dailyTask.findFirstOrThrow({where: {id: candidate.id, userId}, include: timerTaskInclude});
    for (const state of [...task.timerStates]) if (state.runningStartedAt) {
      await writeTaskTimerState(tx, task, pauseTimerState(state, now), reason, null, now, 'in_progress', actorId);
    }
  }
}

export async function getTaskTimers(request: Request) {
  try {
    const {user} = await getServerAuthContext(); if (!user) throw new AccessError('Please sign in.', 401);
    const url = new URL(request.url), ids = z.array(z.string().uuid()).min(1).max(100).parse((url.searchParams.get('ids') ?? '').split(','));
    const day = daySchema.parse(url.searchParams.get('date') ?? toDateOnly()), now = new Date();
    if (day > toDateOnly(now)) throw new AccessError('Future task timers are unavailable.', 400);
    if (url.searchParams.get('userId') !== user.id) throw new AccessError('Your session changed. Refresh before continuing.', 409);
    await freshActor(db, user.id);
    const [tasks, attendanceRunning] = await Promise.all([
      db.dailyTask.findMany({where: {id: {in: ids}, userId: user.id}, include: timerTaskInclude}), taskAttendanceRunning(db, user.id),
    ]);
    return NextResponse.json({userId: user.id, serverNow: now.toISOString(), timers: tasks.map(task => taskTimerSnapshot(task, day, now, attendanceRunning))}, {headers: {'Cache-Control': 'no-store'}});
  } catch (error) {return error instanceof z.ZodError ? NextResponse.json({message: 'Invalid timer query.'}, {status: 400}) : fail(error);}
}
export async function postTaskTimer(request: Request, taskId: string) {
  try {
    checkOrigin(request); const {user} = await getServerAuthContext(); if (!user) throw new AccessError('Please sign in.', 401);
    if (!z.string().uuid().safeParse(taskId).success) throw new AccessError('Invalid task.', 400);
    const input = timerCommandSchema.extend({action: z.enum(['start', 'pause'])}).strict().parse(await request.json().catch(()=>null));
    if (input.expectedUserId !== user.id) throw new AccessError('Your session changed. Refresh before continuing.', 409);
    const timer = await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id=${user.id}::uuid FOR UPDATE`;
      await freshActor(tx, user.id);
      await tx.$queryRaw`SELECT id FROM daily_tasks WHERE id=${taskId}::uuid FOR UPDATE`;
      const task = await tx.dailyTask.findFirst({where: {id: taskId, userId: user.id}, include: timerTaskInclude});
      if (!task) throw new AccessError('Task not found.', 404);
      const now = new Date(), day = toDateOnly(now), attendanceRunning = await taskAttendanceRunning(tx, user.id);
      if (input.reportDate !== day) throw new AccessError('The workday changed. Refresh before continuing.', 409);
      const previous = task.timerStates.find(s => toDateOnly(s.reportDate) === day);
      if (previous?.lastCommandId === input.commandId && previous.lastAction === input.action) return taskTimerSnapshot(task, day, now, attendanceRunning);
      if (taskTimerRevision(task, day) !== input.expectedRevision) throw new AccessError('This timer changed in another tab or device. Review its current state and try again.', 409);
      if (task.planDate > new Date(day)) throw new AccessError('This task is planned for a future workday.', 409);
      if (task.updates[0]?.status === 'done') throw new AccessError('Reopen the completed task before starting its timer.', 409);
      await settlePastTaskTimers(tx, task, now);
      const state = stateForDay(task, day);
      if ((state.trackedMilliseconds>0&&!state.actualStart)|| (state.actualStart&&state.actualStart>now)) throw new AccessError("Saved task timing needs review before starting or pausing.",409);
      if (input.action === 'start' && !attendanceRunning) throw new AccessError('Check in and end your break before starting a task.', 409);
      if (input.action === 'start' && state.runningStartedAt) throw new AccessError('Task timer is already running.', 409);
      if (input.action === 'pause' && !state.runningStartedAt) throw new AccessError('Task timer is already paused.', 409);
      await writeTaskTimerState(tx, task, input.action === 'start' ? startTimerState(state, now) : pauseTimerState(state, now), input.action, input.commandId, now);
      return taskTimerSnapshot(task, day, now, attendanceRunning);
    }, {isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 20_000});
    return NextResponse.json({message: input.action === 'start' ? 'Task timer started.' : 'Task timer paused.', timer});
  } catch (error) {return error instanceof z.ZodError ? NextResponse.json({message: 'Timer controls were updated. Refresh and try again.'}, {status: 400}) : fail(error);}
}
