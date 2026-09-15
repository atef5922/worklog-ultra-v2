'use client';
import {useEffect,useState} from 'react';
import {toast} from 'sonner';
import {CircleStop,LoaderCircle,UsersRound} from 'lucide-react';
export function EmployeePresence(){
 const [meeting,setMeeting]=useState(false),[busy,setBusy]=useState(false);
 useEffect(()=>{
  const controller=new AbortController();let pending=false;
  const beat=async()=>{if(pending)return;pending=true;try{const r=await fetch('/api/dashboard/presence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'heartbeat'}),signal:controller.signal});if(r.ok){const data=await r.json();setMeeting(!!data.presence.meetingStartedAt);}}catch{/* The management view explicitly reports stale connectivity. */}finally{pending=false;}};
  void beat();const interval=window.setInterval(()=>void beat(),30000);window.addEventListener('focus',beat);
  return()=>{controller.abort();window.clearInterval(interval);window.removeEventListener('focus',beat);};
 },[]);
 async function toggle(){if(busy)return;setBusy(true);try{const r=await fetch('/api/dashboard/presence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:meeting?'meeting_end':'meeting_start'})});const data=await r.json();if(!r.ok)throw new Error(data.message);setMeeting(!!data.presence.meetingStartedAt);toast.success(meeting?'Meeting ended.':'Meeting started.');}catch(e){toast.error(e instanceof Error?e.message:'Presence update failed.');}finally{setBusy(false);}}
 return (
  <button
    type="button"
    aria-label={meeting ? 'End meeting' : 'Start meeting'}
    aria-pressed={meeting}
    aria-busy={busy}
    title={busy ? 'Saving meeting status' : meeting ? 'In meeting - End meeting' : 'Start meeting'}
    data-meeting-control
    disabled={busy}
    onClick={toggle}
    className={`button-force-white inline-flex h-11 w-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg border text-[0.8125rem] font-semibold leading-none text-white shadow-[0_2px_8px_rgba(0,0,0,0.18)] transition-[background-color,border-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#06174b] disabled:cursor-wait disabled:opacity-100 disabled:shadow-none sm:w-auto sm:min-w-[9rem] sm:px-3 min-[900px]:h-9 ${meeting ? 'border-[#34d399]/50 bg-[#047857] hover:bg-[#065f46] active:bg-[#064e3b]' : 'border-[#93c5fd]/50 bg-[#2563eb] hover:bg-[#1d4ed8] active:bg-[#1e40af]'}`}
  >
    {busy ? (
      <LoaderCircle aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" />
    ) : meeting ? (
      <CircleStop aria-hidden="true" className="h-4 w-4 shrink-0" />
    ) : (
      <UsersRound aria-hidden="true" className="h-4 w-4 shrink-0" />
    )}
    <span className="hidden sm:inline">{busy ? 'Saving...' : meeting ? 'End meeting' : 'Start meeting'}</span>
  </button>
 );
}
