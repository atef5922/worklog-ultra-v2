"use client";

import {loadTaskTimer,taskTimerSnapshotSchema,publishTaskTimer,timerCommandId} from "@/lib/task-timer-client";
import type {TaskTimerSnapshot} from "@/components/dashboard/dashboard-task-timer-action";
import { z } from "zod";
import { bankTaskTimerSegment } from "@/lib/task-timer-math";
import { type SharedTaskTimerSnapshot } from "@/lib/task-timer-storage";

const updateSchema = z.object({
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["pending", "in_progress", "done"]),
  trackedMinutes: z.number().int().nonnegative(),
  actualStart: z.string().datetime().nullable(),
  actualEnd: z.string().datetime().nullable(),
  note: z.string().nullable(),
});
export type ConfirmedTaskUpdate = z.infer<typeof updateSchema>;
export type CapturedTaskTimerSnapshot = Readonly<TaskTimerSnapshot & {
  revision: string; userId: string; reportDate: string;
}>;
/** Capture once when a dialog opens, never on Save or after a recovery read. */
export function captureTaskLifecycleSnapshot(snapshot?: Readonly<TaskTimerSnapshot>, expectedUserId?: string): CapturedTaskTimerSnapshot {
  if (!snapshot?.revision || !snapshot.userId || !snapshot.reportDate) throw new Error("Wait for the task timer to synchronize.");
  if (expectedUserId && snapshot.userId !== expectedUserId) throw new Error("Your account changed. Close this dialog and refresh.");
  return Object.freeze({...snapshot, revision: snapshot.revision, userId: snapshot.userId, reportDate: snapshot.reportDate});
}

/** A redirect/login page, empty body or unreadable response is not a successful save. */
export async function requestTaskJson(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const raw = await response.text();
  let body: unknown;
  try { body = JSON.parse(raw); } catch { throw new Error("The server returned an unexpected response. Refresh and try again."); }
  const result = z.object({ message: z.string().min(1), taskUpdate: z.unknown().optional(), timer:z.unknown().optional() }).safeParse(body);
  if (response.redirected || !result.success) throw new Error("The save could not be confirmed. Refresh and try again.");
  if (!response.ok) throw new Error(result.data.message);
  return result.data;
}

export function timerAtSave(snapshot: SharedTaskTimerSnapshot & { sampledAt?: number }, now = Date.now()) {
  const base = Number(snapshot.trackedSeconds ?? Number(snapshot.trackedMinutes) * 60);
  const seconds = snapshot.runningStartedAt
    ? bankTaskTimerSegment(base, snapshot.sampledAt ?? snapshot.runningStartedAt, now)
    : base;
  return { ...snapshot, trackedMinutes: String(Math.floor(seconds / 60)), trackedSeconds: String(seconds) };
}

async function sendPersonalTimer(taskId: string, reportDate: string, snapshot: TaskTimerSnapshot, note?: string) {
  if (snapshot.status === "done") throw new Error("Use Done or reason-required Reopen for completed work.");
  if (!snapshot.revision || !snapshot.userId || snapshot.reportDate !== reportDate) throw new Error("Wait for the task timer to synchronize.");
  const result = await requestTaskJson("/api/dashboard/report", {
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:"save_note",taskId,reportDate,note:note??"",expectedUserId:snapshot.userId,expectedRevision:snapshot.revision}),
  });
  const timer=taskTimerSnapshotSchema.parse(result.timer);
  if(timer.taskId!==taskId||timer.userId!==snapshot.userId||timer.reportDate!==reportDate)throw new Error("The saved note could not be confirmed for this task.");
  publishTaskTimer(timer);
  return result;
}
async function sendLifecycle(taskId:string,body:object){
  const command=body as {commandId:string;expectedUserId:string;reportDate:string;action:string};
  const expectedAction=command.action==="complete_task"?"complete":"reopen";
  let result:{message:string;taskUpdate?:unknown;timer?:unknown};
  try{
    result=await requestTaskJson(`/api/dashboard/tasks/${taskId}`,{
      method:"POST",headers:{"Content-Type":"application/json"},signal:AbortSignal.timeout(15000),body:JSON.stringify(body),
    });
    if(!updateSchema.safeParse(result.taskUpdate).success||!taskTimerSnapshotSchema.safeParse(result.timer).success)throw new Error("The saved task state could not be confirmed. Refresh before retrying.");
  }catch(error){
    const current=await loadTaskTimer(command.expectedUserId,taskId,command.reportDate).catch(()=>null);
    if(!current||current.lastCommandId!==command.commandId||current.lastAction!==expectedAction){
      if(current)publishTaskTimer(current);
      throw error;
    }
    result={message:"Task save confirmed after reconnecting.",timer:current,taskUpdate:{
      reportDate:current.reportDate,status:current.status,trackedMinutes:Math.floor(current.trackedMilliseconds/60000),
      actualStart:current.actualStart,actualEnd:current.actualEnd,note:current.note??null,
    }};
  }
  const update=updateSchema.parse(result.taskUpdate),timer=taskTimerSnapshotSchema.parse(result.timer);
  if(timer.taskId!==taskId||timer.userId!==command.expectedUserId||timer.reportDate!==command.reportDate||timer.lastCommandId!==command.commandId||timer.lastAction!==expectedAction)throw new Error("The saved task state could not be confirmed.");
  publishTaskTimer(timer);
  const snapshot:TaskTimerSnapshot={status:timer.status,note:timer.note === undefined ? update.note : timer.note,revision:timer.revision,userId:timer.userId,reportDate:timer.reportDate,
    trackedMinutes:String(update.trackedMinutes),trackedSeconds:String(Math.floor(timer.trackedMilliseconds/1000)),
    actualStart:timer.actualStart??"",actualEnd:timer.actualEnd??"",runningStartedAt:timer.runningStartedAt??""};
  return {message:result.message,update,snapshot};
}

// Prevent two controls in this page from submitting conflicting writes for one task.
// The server additionally checks a durable revision while holding row locks.
const pendingWrites = new Set<string>();
async function taskWrite<T>(taskId: string, action: () => Promise<T>): Promise<T> {
  if (pendingWrites.has(taskId)) throw new Error("This task is already being saved. Please wait.");
  pendingWrites.add(taskId);
  try { return await action(); } finally { pendingWrites.delete(taskId); }
}
export function savePersonalTimer(taskId: string, reportDate: string, snapshot: TaskTimerSnapshot, note?: string) {
  return taskWrite(taskId, () => sendPersonalTimer(taskId, reportDate, snapshot, note));
}
function lifecycle(taskId: string, body: object) {
  return taskWrite(taskId, () => sendLifecycle(taskId, body));
}

export async function completePersonalTask(taskId:string,completionNote:string,snapshot:TaskTimerSnapshot){
 const opened=captureTaskLifecycleSnapshot(snapshot);
 return lifecycle(taskId,{action:"complete_task",completionStatus:"done",completionNote,commandId:timerCommandId(),
   reportDate:opened.reportDate,expectedUserId:opened.userId,expectedRevision:opened.revision});
}
export async function reopenPersonalTask(taskId:string,reopenReason:string,snapshot:Readonly<TaskTimerSnapshot>){
 const opened=captureTaskLifecycleSnapshot(snapshot);
 return lifecycle(taskId,{action:"reopen_task",reopenReason,commandId:timerCommandId(),
   reportDate:opened.reportDate,expectedUserId:opened.userId,expectedRevision:opened.revision});
}
