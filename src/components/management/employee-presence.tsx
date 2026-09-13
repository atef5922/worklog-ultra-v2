'use client';
import {useEffect,useState} from 'react';
import {toast} from 'sonner';
export function EmployeePresence(){
 const [meeting,setMeeting]=useState(false),[busy,setBusy]=useState(false);
 useEffect(()=>{
  const controller=new AbortController();let pending=false;
  const beat=async()=>{if(pending)return;pending=true;try{const r=await fetch('/api/dashboard/presence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'heartbeat'}),signal:controller.signal});if(r.ok){const data=await r.json();setMeeting(!!data.presence.meetingStartedAt);}}catch{/* The management view explicitly reports stale connectivity. */}finally{pending=false;}};
  void beat();const interval=window.setInterval(()=>void beat(),30000);window.addEventListener('focus',beat);
  return()=>{controller.abort();window.clearInterval(interval);window.removeEventListener('focus',beat);};
 },[]);
 async function toggle(){if(busy)return;setBusy(true);try{const r=await fetch('/api/dashboard/presence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:meeting?'meeting_end':'meeting_start'})});const data=await r.json();if(!r.ok)throw new Error(data.message);setMeeting(!!data.presence.meetingStartedAt);toast.success(meeting?'Meeting ended.':'Meeting started.');}catch(e){toast.error(e instanceof Error?e.message:'Presence update failed.');}finally{setBusy(false);}}
 return <div className="mb-2 flex justify-end"><button type="button" disabled={busy} onClick={toggle} className={`rounded-lg border px-3 py-1 text-xs disabled:opacity-50 ${meeting?'border-blue-300 bg-blue-50 text-blue-700':'border-[var(--panel-border)] text-[var(--muted-foreground)]'}`}>{busy?'Saving…':meeting?'In meeting · End meeting':'Start meeting'}</button></div>;
}
