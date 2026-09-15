'use client';
import {z} from 'zod';
const timestamp = z.string().datetime();
export const taskTimerSnapshotSchema = z.object({
  taskId: z.string().uuid(), userId: z.string().uuid(), reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note:z.string().nullable().optional(), revision: z.string().regex(/^[a-f0-9]{64}$/), status: z.enum(['pending','in_progress','done']),
  trackedMilliseconds: z.number().int().min(0).max(86_400_000), actualStart: timestamp.nullable(), actualEnd: timestamp.nullable(),
  runningStartedAt: timestamp.nullable(), serverNow: timestamp, canStart: z.boolean(),
  lastCommandId: z.string().nullable(), lastAction: z.string().nullable(),
});
export type ServerTaskTimer = z.infer<typeof taskTimerSnapshotSchema>;
export const TASK_TIMER_UPDATED_EVENT = 'worklog:server-task-timer-updated';
export const taskTimerSyncKey = (userId: string) => `server-task-timer:${userId}`;
export function timerCommandId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16)); bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export async function timerResponse(response: Response) {
  let body: unknown;
  try {body = JSON.parse(await response.text());} catch {throw new Error('Task timer confirmation was unreadable. Refresh before retrying.');}
  if (response.redirected) throw new Error('Your session changed. Please sign in again.');
  if (!response.ok) {
    const error = z.object({message: z.string()}).safeParse(body);
    throw new Error(error.success ? error.data.message : 'Task timer could not be confirmed.');
  }
  return body;
}
export async function loadTaskTimers(userId: string, taskIds: string[], date: string) {
  const query = new URLSearchParams({userId, ids: taskIds.join(','), date});
  const body = await timerResponse(await fetch(`/api/dashboard/task-timers?${query}`, {cache:'no-store', signal:AbortSignal.timeout(15_000)}));
  const parsed = z.object({userId:z.string(), timers:z.array(taskTimerSnapshotSchema)}).safeParse(body);
  if (!parsed.success || parsed.data.userId !== userId || parsed.data.timers.some(t=>t.userId!==userId||!taskIds.includes(t.taskId)||t.reportDate!==date)) {
    throw new Error('Task timer state could not be verified for your account.');
  }
  return parsed.data.timers;
}
export async function loadTaskTimer(userId: string, taskId: string, date: string) {
  const timer = (await loadTaskTimers(userId,[taskId],date))[0];
  if (!timer) throw new Error('Task is no longer available in your account.');
  return timer;
}
export function publishTaskTimer(timer: ServerTaskTimer) {
  window.dispatchEvent(new CustomEvent(TASK_TIMER_UPDATED_EVENT,{detail:timer}));
  try {localStorage.setItem(taskTimerSyncKey(timer.userId), `${timer.revision}:${timerCommandId()}`);} catch { /* Polling still synchronizes tabs. */ }
}
export async function saveTaskTimer(timer: ServerTaskTimer, action: 'start'|'pause') {
  const commandId = timerCommandId();
  try {
    const body = await timerResponse(await fetch(`/api/dashboard/tasks/${timer.taskId}/timer`, {
      method:'POST', headers:{'Content-Type':'application/json'}, signal:AbortSignal.timeout(15_000),
      body:JSON.stringify({action, commandId, reportDate:timer.reportDate, expectedUserId:timer.userId, expectedRevision:timer.revision}),
    }));
    const result = z.object({message:z.string(),timer:taskTimerSnapshotSchema}).parse(body);
    if(result.timer.userId!==timer.userId||result.timer.taskId!==timer.taskId||result.timer.reportDate!==timer.reportDate||result.timer.lastCommandId!==commandId||result.timer.lastAction!==action) throw new Error('The requested task action could not be confirmed.');
    publishTaskTimer(result.timer); return result;
  } catch (error) {
    // A lost acknowledgement must not be re-sent with a new revision and close a later session.
    const current = await loadTaskTimer(timer.userId,timer.taskId,timer.reportDate).catch(()=>null);
    if(current) publishTaskTimer(current);
    if(current?.lastCommandId===commandId && current.lastAction===action) return {timer:current,message:'Task timer save confirmed after reconnecting.'};
    throw error;
  }
}
