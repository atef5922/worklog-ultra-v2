import {timerElapsed, pauseTimerState, timerDayEnd, type TimerState} from './task-timer-state';
type Update = {reportDate:Date;trackedMinutes:number;actualStart:Date|null;actualEnd:Date|null};
/** A read projection only: never manufactures sessions or changes saved evidence. */
export function projectTaskTimers<T extends {updates:Update[];timerStates?:TimerState[]}>(task:T,now=new Date()):T {
  return {...task,updates:task.updates.map(update=>{
    const state=task.timerStates?.find(s=>s.reportDate.getTime()===update.reportDate.getTime());
    if(!state)return update;
    const current=now>=timerDayEnd(state.reportDate.toISOString().slice(0,10))?pauseTimerState(state,now):state;
    return {...update,trackedMinutes:Math.floor(timerElapsed(current,now)/60000),actualStart:current.actualStart,actualEnd:current.actualEnd};
  })};
}
export function hasRunningTaskTimer(task:{timerStates?:TimerState[]},now=new Date()){
  return task.timerStates?.some(s=>s.runningStartedAt&&now<timerDayEnd(s.reportDate.toISOString().slice(0,10)))??false;
}
