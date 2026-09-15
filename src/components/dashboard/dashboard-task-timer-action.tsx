'use client';
import type {ReactNode} from 'react';
import {Pause, Play, Timer} from 'lucide-react';
import {useRouter} from 'next/navigation';
import {useCallback, useEffect, useRef, useState} from 'react';
import {toast} from 'sonner';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {useServerTaskTimer} from './task-timer-provider';
import {saveTaskTimer} from '@/lib/task-timer-client';
import {formatTimeOnlyInDhaka, toDateTimeInputValue} from '@/lib/utils';

type DashboardTaskTimerActionProps = {
  taskId:string; taskTitle?:string; reportDate:string; canEdit:boolean;
  initialStatus:'done'|'in_progress'|'pending'; initialTrackedMinutes:number;
  initialActualStart?:Date|string|null; initialActualEnd?:Date|string|null;
  compact?:boolean; variant?:'default'|'table'; initialAttendanceRunning?:boolean;
  onDoneClick?:()=>void; onSnapshotChange?:(snapshot:TaskTimerSnapshot)=>void;
  afterDoneSlot?:ReactNode; workflowBusy?:boolean; onSavingChange?:(saving:boolean)=>void;
};
export type TaskTimerSnapshot = {
  note?:string|null; sampledAt?:number; revision?:string; userId?:string; reportDate?:string;
  status:'done'|'in_progress'|'pending'; trackedMinutes:string; trackedSeconds:string;
  actualStart:string; actualEnd:string; runningStartedAt:string;
};
function formatDuration(s:number){return `${Math.floor(s/3600)}h ${String(Math.floor(s%3600/60)).padStart(2,'0')}m ${String(s%60).padStart(2,'0')}s`;}
function formatCompactDuration(s:number){return s>=3600?`${Math.floor(s/3600)}h ${String(Math.floor(s%3600/60)).padStart(2,'0')}m`:`${Math.floor(s/60)}m ${String(s%60).padStart(2,'0')}s`;}
/** Keep filtered-out rows synchronized, including Active/Completed filter counts. */
export function TaskTimerObserver({taskId,reportDate,onSnapshot}:{taskId:string;reportDate:string;onSnapshot:(id:string,snapshot:TaskTimerSnapshot,day:string)=>void}){
 const {timer}=useServerTaskTimer(taskId,reportDate);
 useEffect(()=>{if(timer)onSnapshot(taskId,{revision:timer.revision,userId:timer.userId,reportDate:timer.reportDate,status:timer.status,note:timer.note,
 trackedMinutes:String(Math.floor(timer.trackedMilliseconds/60000)),trackedSeconds:String(Math.floor(timer.trackedMilliseconds/1000)),
 actualStart:timer.actualStart??'',actualEnd:timer.actualEnd??'',runningStartedAt:timer.runningStartedAt??''},reportDate);},[timer,taskId,reportDate,onSnapshot]);
 return null;
}
export function DashboardTaskTimerAction({
 taskId,taskTitle,reportDate,canEdit,initialStatus,initialTrackedMinutes,initialActualStart,initialActualEnd,
 compact=false,variant='default',onDoneClick,onSnapshotChange,afterDoneSlot,workflowBusy=false,onSavingChange,
}:DashboardTaskTimerActionProps){
 const router=useRouter(), {timer,receivedAt,error,refresh}=useServerTaskTimer(taskId,reportDate);
 const [tick,setTick]=useState(0), [saving,setSaving]=useState(false), savingRef=useRef(false);
 const status=timer?.status??initialStatus;
 const isCompleted=status==='done';
 const now=timer?new Date(timer.serverNow).getTime()+Math.max(0,tick-receivedAt):0;
 const dayEnd=new Date(`${reportDate}T00:00:00+06:00`).getTime()+86400000;
 const runningStartedAt=timer?.runningStartedAt && now<dayEnd ? timer.runningStartedAt : '';
 const liveTrackedSeconds=Math.floor(((timer?.trackedMilliseconds??initialTrackedMinutes*60000)+
   (timer?.runningStartedAt?Math.max(0,Math.min(now,dayEnd)-new Date(timer.serverNow).getTime()):0))/1000);
 const trackedSecondsBase=liveTrackedSeconds;
 const actualStart=timer?(timer.actualStart??''):(initialActualStart?new Date(initialActualStart).toISOString():'');
 const actualEnd=timer?(timer.actualEnd??''):(initialActualEnd?new Date(initialActualEnd).toISOString():'');
 const attendanceBlocksStart=!timer?.canStart;
 const ready=Boolean(timer)&&!error&&!saving&&!workflowBusy&&canEdit;
 const canStart=ready&&!isCompleted&&!runningStartedAt&&!attendanceBlocksStart&&now<dayEnd;
 const canPause=ready&&Boolean(runningStartedAt);
 const canDone=ready&&!isCompleted&&Boolean(onDoneClick)&&now<dayEnd;
 const shouldShowResumeLabel=!runningStartedAt&&(status==='in_progress'||liveTrackedSeconds>0||Boolean(actualStart));
 const startClockValue=actualStart?toDateTimeInputValue(actualStart).slice(11,16):'';
 const endClockValue=actualEnd?toDateTimeInputValue(actualEnd).slice(11,16):'';
 useEffect(()=>{const id=setInterval(()=>setTick(performance.now()),1000);return()=>clearInterval(id);},[]);
 useEffect(()=>{onSavingChange?.(saving);},[saving,onSavingChange]);
 useEffect(()=>{
   if(!timer)return;
   onSnapshotChange?.({revision:timer.revision,userId:timer.userId,reportDate:timer.reportDate,
     status,note:timer.note,trackedMinutes:String(Math.floor(liveTrackedSeconds/60)),trackedSeconds:String(liveTrackedSeconds),
     actualStart,actualEnd,runningStartedAt});
 },[timer,status,liveTrackedSeconds,actualStart,actualEnd,runningStartedAt,onSnapshotChange]);
 const change=useCallback(async(action:'start'|'pause')=>{
   if(!timer||savingRef.current||(action==='start'?!canStart:!canPause))return;
   savingRef.current=true;setSaving(true);
   try{
     await saveTaskTimer(timer,action);
     window.dispatchEvent(new CustomEvent(action==='start'?'worklog:task-monitor-start':'worklog:task-monitor-stop',
       {detail:{source:`task:${taskId}`,label:taskTitle||'Task'}}));
     toast.success(action==='start'?'Task timer started.':'Task timer paused.');
     router.refresh();
   }catch(e){toast.error(e instanceof Error?e.message:'Timer save failed.');refresh();}
   finally{savingRef.current=false;setSaving(false);}
 },[timer,canStart,canPause,taskId,taskTitle,router,refresh]);
 const startTimer=()=>change('start'), pauseTimer=()=>change('pause');
 useEffect(()=>{
   if(!canStart)return;
   try{
     const raw=sessionStorage.getItem('dashboard-task-autostart');if(!raw)return;
     const value=JSON.parse(raw);
     if(value.taskId===taskId&&value.reportDate===reportDate&&Date.now()-value.timestamp<15000){
       sessionStorage.removeItem('dashboard-task-autostart');void change('start');
     }
   }catch{sessionStorage.removeItem('dashboard-task-autostart');}
 },[canStart,taskId,reportDate,change]);
 function handleDoneClick(){if(canDone&&!savingRef.current)onDoneClick?.();}
  const buttonClass = compact
    ? "h-6 min-w-[3rem] shrink-0 justify-center rounded-md border px-1.5 text-[0.5rem] font-semibold transition-colors duration-200 min-[420px]:min-w-[3.25rem] min-[420px]:px-2 min-[420px]:text-[0.5625rem] min-[560px]:min-w-[3.5rem] min-[560px]:px-2.5 min-[560px]:text-[0.625rem]"
    : "h-7 min-w-[5rem] justify-center rounded-md border px-2.5 text-xs font-semibold transition-colors duration-200";
  // Soft fills, not solid colour: a light tint plus solid text, the same
  // convention the chips use, so the row reads calmly instead of shouting.
  // Start is green (go), Pause is amber (hold), Done is the app's own brand
  // indigo (the primary action on the row).
  const startButtonClass = `${buttonClass} task-btn-go`;
  const pauseButtonClass = `${buttonClass} task-btn-hold`;
  const doneButtonClass = `${buttonClass} task-btn-primary`;

  if (variant === "table") {
    const tableCellClass =
      "border-b border-r border-[var(--workplan-grid)] px-2 py-1.5 align-middle last:border-r-0";

    return (
      <>
        <td className={tableCellClass}>
          <div className="flex min-w-0 items-center gap-1.5">
            {runningStartedAt ? (
              <Button
                className={pauseButtonClass}
                disabled={!canPause}
                onClick={pauseTimer}
                type="button"
                variant="ghost"
              >
                <Pause className="h-3 w-3" />
                Pause
              </Button>
            ) : (
              <Button
                className={startButtonClass}
                disabled={!canStart}
                onClick={startTimer}
                title={
                  attendanceBlocksStart
                    ? "Check in first — the workday timer is stopped."
                    : error ?? (!timer ? "Loading saved timer..." : undefined)
                }
                type="button"
                variant="ghost"
              >
                <Play className="h-3 w-3" />
                {shouldShowResumeLabel ? "Resume" : "Start"}
              </Button>
            )}
            <span
              className="min-w-0 truncate text-[0.58rem] font-semibold tabular-nums text-[var(--muted-foreground)]"
              title={error ?? `Tracked: ${formatDuration(liveTrackedSeconds)}`}
            >
              {error ? "Sync unavailable" : !timer ? "Loading..." : formatCompactDuration(liveTrackedSeconds)}
            </span>
          </div>
        </td>
        <td className={tableCellClass}>
          <div className="flex items-center justify-center gap-1">
            <Button
              className={doneButtonClass}
              disabled={!canDone}
              onClick={handleDoneClick}
              type="button"
              variant="ghost"
            >
              Done
            </Button>
            {afterDoneSlot ?? null}
          </div>
        </td>
        <td className={tableCellClass}>
          <span className="block text-center text-[0.67rem] font-semibold tabular-nums text-[var(--muted-foreground)]">
            {actualStart ? formatTimeOnlyInDhaka(actualStart) : "--:--"}
          </span>
        </td>
        <td className={tableCellClass}>
          <span className="block text-center text-[0.67rem] font-semibold tabular-nums text-[var(--muted-foreground)]">
            {actualEnd ? formatTimeOnlyInDhaka(actualEnd) : "--:--"}
          </span>
        </td>
      </>
    );
  }

  if (isCompleted) return <div className="flex flex-wrap items-center gap-3 text-sm">
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-2 text-emerald-700">
      <Timer className="h-4 w-4" /> {formatDuration(trackedSecondsBase)}
    </span>
    {afterDoneSlot}
  </div>;

  return (
    <div className={compact ? "flex w-full min-w-0 max-w-full flex-col gap-1" : "flex min-w-[10.625rem] flex-col gap-2"}>
      <div className={compact ? "flex min-w-0 flex-wrap items-center gap-1" : "flex flex-wrap items-center gap-1.5"}>
        {/* Pause takes Start's place while running rather than sitting beside it:
            the two are never usable at the same time, and the row has no width to
            spare on the single-screen dashboard. */}
        {runningStartedAt ? (
          <Button
            className={pauseButtonClass}
            disabled={!canPause}
            onClick={pauseTimer}
            type="button"
            variant="ghost"
          >
            <Pause className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
            Pause
          </Button>
        ) : (
          <Button
            className={startButtonClass}
            disabled={!canStart}
            onClick={startTimer}
            // A disabled button with no reason is a dead end; say why on hover.
            title={attendanceBlocksStart ? "Check in first — the workday timer is stopped." : error ?? (!timer ? "Loading saved timer..." : undefined)}
            type="button"
            variant="ghost"
          >
            <Play className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
            {shouldShowResumeLabel ? "Resume" : "Start"}
          </Button>
        )}
        {isCompleted ? null : (
          <Button
            className={doneButtonClass}
            disabled={!canDone}
            onClick={handleDoneClick}
            type="button"
            variant="ghost"
          >
            Done
          </Button>
        )}
        {afterDoneSlot ? afterDoneSlot : null}
      </div>
      {compact ? (
        /* Elapsed, start and end on one line. The elapsed chip sizes to its own
           text (auto) and the two fields split what is left, so the row holds
           together without the chip stealing a line of its own. */
        <div className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] items-center gap-1">
          <span className="inline-flex shrink-0 items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[0.5rem] font-semibold tabular-nums text-slate-600">
            <Timer className="h-3 w-3 text-[#4f5ef7]" />
            {formatDuration(liveTrackedSeconds)}
          </span>
          <Input
            className="h-6 min-w-0 border rounded-md border-slate-200 px-2 text-[0.5625rem] bg-white text-slate-600"
            disabled={!canEdit || saving || Boolean(runningStartedAt)}
            readOnly
            aria-label="Task start time"
            type="time"
            value={startClockValue}
          />
          <Input
            className="h-6 min-w-0 border rounded-md border-slate-200 px-2 text-[0.5625rem] bg-white text-slate-600"
            disabled={!canEdit || saving || Boolean(runningStartedAt) || !actualStart}
            readOnly
            aria-label="Task end time"
            type="time"
            value={endClockValue}
          />
        </div>
      ) : (
        <>
          <span className="inline-flex items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[0.625rem] font-semibold tabular-nums text-slate-600">
            <Timer className="h-3.5 w-3.5 text-[#4f5ef7]" />
            {formatDuration(liveTrackedSeconds)}
          </span>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
            <Input
              disabled={!canEdit || saving || Boolean(runningStartedAt)}
              readOnly
            aria-label="Task start time"
              type="time"
              value={startClockValue}
            />
            <span className="hidden sm:inline" />
            <Input
              disabled={!canEdit || saving || Boolean(runningStartedAt) || !actualStart}
              readOnly
            aria-label="Task end time"
              type="time"
              value={endClockValue}
            />
          </div>
        </>
      )}
      {!compact ? (
        <p className="text-[0.6875rem] font-medium text-slate-500">
          {runningStartedAt
            ? `Started ${formatTimeOnlyInDhaka(actualStart || runningStartedAt)}`
            : actualStart
              ? actualEnd
                ? `Saved ${formatTimeOnlyInDhaka(actualStart)} - ${formatTimeOnlyInDhaka(actualEnd)}`
                : `Manual time ${formatTimeOnlyInDhaka(actualStart)}`
              : "Not started yet"}
        </p>
      ) : null}
    </div>
  );
}
