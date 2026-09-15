'use client';
import {createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode} from 'react';
import {ATTENDANCE_UPDATED_EVENT} from '@/lib/attendance-client';
import {loadTaskTimers, TASK_TIMER_UPDATED_EVENT, taskTimerSyncKey, type ServerTaskTimer} from '@/lib/task-timer-client';

type TimerEntry = {timer:ServerTaskTimer|null; receivedAt:number; error:string|null};
const empty:TimerEntry = {timer:null,receivedAt:0,error:null};
class TimerStore {
  entries = new Map<string,TimerEntry>();
  listeners = new Map<string,Set<()=>void>>();
  pending=false; again=false; timeout:ReturnType<typeof setTimeout>|undefined;
  disposed=false;
  constructor(readonly userId:string) {}
  subscribe(key:string,listener:()=>void) {
    const group=this.listeners.get(key)??new Set(); group.add(listener);this.listeners.set(key,group);this.schedule();
    return ()=>{group.delete(listener);if(!group.size)this.listeners.delete(key);};
  }
  activate(){this.disposed=false;this.schedule();}
  deactivate(){this.disposed=true;clearTimeout(this.timeout);this.timeout=undefined;}
  get(key:string) {return this.entries.get(key)??empty;}
  set(key:string,entry:TimerEntry) {if(this.disposed)return;this.entries.set(key,entry);this.listeners.get(key)?.forEach(fn=>fn());}
  receive(timer:ServerTaskTimer) {
    if(timer.userId!==this.userId)return;
    this.set(`${timer.reportDate}:${timer.taskId}`,{timer,receivedAt:performance.now(),error:null});
  }
  schedule=()=>{if(this.timeout||this.disposed)return;this.timeout=setTimeout(()=>{this.timeout=undefined;void this.refresh();},0);};
  refresh=async()=>{
    if(this.disposed)return;if(this.pending){this.again=true;return;}this.pending=true;
    const dates=new Map<string,string[]>();
    for(const key of this.listeners.keys()){const day=key.slice(0,10);dates.set(day,[...(dates.get(day)??[]),key.slice(11)]);}
    try {
      for(const [day,ids] of dates) for(let i=0;i<ids.length;i+=100){
        const batch=ids.slice(i,i+100), before=new Map(batch.map(id=>[id,this.get(`${day}:${id}`).timer?.revision]));
        try {
          const timers=await loadTaskTimers(this.userId,batch,day), found=new Set(timers.map(t=>t.taskId));
          for(const timer of timers){
            // A read started before a confirmed local write cannot overwrite that write.
            const current=this.get(`${day}:${timer.taskId}`).timer;
            if(current?.revision!==before.get(timer.taskId)&&current?.revision!==timer.revision)continue;
            this.receive(timer);
          }
          for(const id of batch)if(!found.has(id)&&this.get(`${day}:${id}`).timer?.revision===before.get(id))this.set(`${day}:${id}`,{timer:null,receivedAt:0,error:'Task is no longer available.'});
        }catch(error){for(const id of batch){const key=`${day}:${id}`;if(this.get(key).timer?.revision!==before.get(id))continue;this.set(key,{...this.get(key),error:error instanceof Error?error.message:'Timer synchronization failed.'});}}
      }
    }finally{this.pending=false;if(this.again){this.again=false;this.schedule();}}
  };
}
const TimerContext=createContext<TimerStore|null>(null);
export function TaskTimerProvider({userId,children}:{userId:string;children:ReactNode}) {
  const store=useMemo(()=>new TimerStore(userId),[userId]);
  useEffect(()=>{
    store.activate();
    const refresh=()=>store.schedule();
    const visible=()=>{if(document.visibilityState==='visible')refresh();};
    const storage=(event:StorageEvent)=>{if(event.key===taskTimerSyncKey(userId))refresh();};
    const updated=(event:Event)=>{store.receive((event as CustomEvent<ServerTaskTimer>).detail);};
    const interval=setInterval(visible,15_000);
    window.addEventListener('focus',refresh);window.addEventListener('online',refresh);window.addEventListener('storage',storage);
    document.addEventListener('visibilitychange',visible);window.addEventListener(ATTENDANCE_UPDATED_EVENT,refresh);window.addEventListener(TASK_TIMER_UPDATED_EVENT,updated);
    return ()=>{store.deactivate();clearInterval(interval);
      window.removeEventListener('focus',refresh);window.removeEventListener('online',refresh);window.removeEventListener('storage',storage);
      document.removeEventListener('visibilitychange',visible);window.removeEventListener(ATTENDANCE_UPDATED_EVENT,refresh);window.removeEventListener(TASK_TIMER_UPDATED_EVENT,updated);};
  },[store,userId]);
  return <TimerContext.Provider value={store}>{children}</TimerContext.Provider>;
}
export function useTaskTimerIdentity(){const store=useContext(TimerContext);if(!store)throw new Error('Task timer provider is missing.');return store.userId;}
export function useServerTaskTimer(taskId:string,day:string) {
  const store=useContext(TimerContext);if(!store)throw new Error('Task timer provider is missing.');
  const key=`${day}:${taskId}`;
  const subscribe=useCallback((fn:()=>void)=>store.subscribe(key,fn),[store,key]);
  const get=useCallback(()=>store.get(key),[store,key]);
  return {...useSyncExternalStore(subscribe,get,()=>empty),refresh:store.schedule};
}
