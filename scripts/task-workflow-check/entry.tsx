import React from "react";
import {createRoot} from "react-dom/client";
import {Toaster} from "sonner";
import {DashboardWorkPlanSection} from "../../src/components/dashboard/dashboard-work-plan-table";
import {AssignmentWorkPanel} from "../../src/components/dashboard/assignment-work-panel";
import {DashboardWorkspaceModal} from "../../src/components/dashboard/dashboard-workspace-modal";
import {TaskTimerProvider} from "../../src/components/dashboard/task-timer-provider";
import {toDateOnly} from "../../src/lib/utils";
import type {ServerTaskTimer} from "../../src/lib/task-timer-client";
declare global {interface Window {phaseOneTest:{deferTimerReads:boolean;lastReadRevision:string|null;failTimerReads:boolean;failNext:""|"http"|"html"|"network";requests:Array<{url:string;body:Record<string,unknown>}>;submitted:boolean;monitorEvents:string[];timer:ServerTaskTimer}}}
const id="11111111-1111-4111-8111-111111111111",userId="22222222-2222-4222-8222-222222222222",day=toDateOnly();
let timer:ServerTaskTimer={taskId:id,userId,reportDate:day,revision:"a".repeat(64),status:"pending",trackedMilliseconds:0,actualStart:null,actualEnd:null,runningStartedAt:null,serverNow:new Date().toISOString(),canStart:true,lastAction:null,lastCommandId:null};
const previous=localStorage.getItem('synthetic-server-timer');if(previous)timer=JSON.parse(previous);

window.phaseOneTest={deferTimerReads:false,lastReadRevision:null,failTimerReads:false,failNext:"",requests:[],submitted:false,monitorEvents:[],timer};
for(const event of ["worklog:task-monitor-start","worklog:task-monitor-stop"])window.addEventListener(event,()=>window.phaseOneTest.monitorEvents.push(event));
let note:string|null=null;
const commentReplies:Array<{id:string;body:string;createdAt:string;authorId:string;authorName:string}>=[];
function current(){const latest=localStorage.getItem("synthetic-server-timer");if(latest)timer=JSON.parse(latest);const now=new Date();return {...timer,serverNow:now.toISOString(),trackedMilliseconds:timer.trackedMilliseconds+(timer.runningStartedAt?Math.max(0,now.getTime()-new Date(timer.serverNow).getTime()):0)};}
window.fetch=async(input,init)=>{
 const url=String(input),body=init?.body instanceof FormData?Object.fromEntries(init.body):JSON.parse(String(init?.body??"{}"));
 window.phaseOneTest.requests.push({url,body});
 if(url.includes("/comments")){
   if(url.endsWith("/read"))return Response.json({success:true});
   if(init?.method==="POST"){
     const comment={id:crypto.randomUUID(),body:String(body.body),createdAt:new Date().toISOString(),authorId:userId,authorName:"You"};
     commentReplies.push(comment);return Response.json({success:true,comment},{status:201});
   }
   if(url.includes("summary=1"))return Response.json({success:true,unreadCount:1});
   return Response.json({success:true,taskTitle:"Synthetic workflow task",unreadCount:1,hasMore:false,nextCursor:null,currentUserId:userId,comments:[
     {id:"44444444-4444-4444-8444-444444444444",body:"Please review this task.",createdAt:"2026-09-17T06:00:00.000Z",authorId:"33333333-3333-4333-8333-333333333333",authorName:"Manager"},
     ...commentReplies,
   ]});
 }
 if(url.includes("/task-timers?")){
   while(window.phaseOneTest.deferTimerReads)await new Promise(resolve=>setTimeout(resolve,20));
   if(window.phaseOneTest.failTimerReads)return Response.json({message:"Synthetic timer read rejected"},{status:503});
   const saved=current();window.phaseOneTest.lastReadRevision=saved.revision;return Response.json({userId,timers:[saved]});
 }
 const failure=window.phaseOneTest.failNext;window.phaseOneTest.failNext="";await new Promise(resolve=>setTimeout(resolve,120));
 if(failure==="network")throw new TypeError("Synthetic network failure");
 if(failure==="html")return new Response("<html>Login</html>");
 if(failure==="http")return Response.json({message:"Synthetic save rejected"},{status:409});
 if(url.endsWith("/review"))return Response.json({message:"Review submitted"});
 timer=current();note=timer.note??null;
 if(body.expectedRevision!==timer.revision||body.expectedUserId!==userId)return Response.json({message:"Synthetic stale revision"},{status:409});
 if("trackedMinutes" in body||"actualStart" in body||"updates" in body)throw new Error("Client timing is forbidden");
 if(body.action==="save_note")note=body.note;
 else if(body.action==="start")timer={...timer,status:"in_progress",actualStart:timer.actualStart??timer.serverNow,actualEnd:null,runningStartedAt:timer.serverNow,canStart:false,lastAction:"start",lastCommandId:body.commandId};
 else if(body.action==="pause"||body.action==="complete_task")timer={...timer,status:body.action==="pause"?"in_progress":"done",actualEnd:timer.serverNow,runningStartedAt:null,canStart:body.action==="pause",lastAction:body.action==="pause"?"pause":"complete",lastCommandId:body.commandId};
 else if(body.action==="reopen_task")timer={...timer,status:"in_progress",runningStartedAt:null,canStart:true,lastAction:"reopen",lastCommandId:body.commandId};
 else throw new Error("Unexpected action");
 if(body.action==="complete_task")note=body.completionNote;
 timer={...timer,note,revision:crypto.randomUUID().replaceAll('-','').repeat(2)};window.phaseOneTest.timer=timer;localStorage.setItem('synthetic-server-timer',JSON.stringify(timer));
 return Response.json({message:body.action==="complete_task"?"Task completed":body.action==="reopen_task"?"Task reopened":"Saved",
 timer,taskUpdate:{reportDate:day,status:timer.status,trackedMinutes:Math.floor(timer.trackedMilliseconds/60000),actualStart:timer.actualStart,actualEnd:timer.actualEnd,note}});
};
const task={id,taskTitle:"Synthetic workflow task",taskDescription:"Regression test only",priority:"normal",planDate:day,userId,departmentName:"Test department",updates:[],createdAt:new Date().toISOString()};
const view=new URLSearchParams(location.search).get("view");
createRoot(document.getElementById("root")!).render(<React.StrictMode><TaskTimerProvider userId={userId}><Toaster/>
 {view==="assignment"?<AssignmentWorkPanel task={task} attendanceRunning initialNote="Supporting evidence" onSubmitted={()=>{window.phaseOneTest.submitted=true;}}/>
 :view==="modal"?<DashboardWorkspaceModal departments={[{id,name:"Test department"}]} initialTasks={[]} suggestions={[]} role="employee" assignableUsers={[]} currentUserId={userId} userDepartmentId={id}/>
 :<DashboardWorkPlanSection tasks={[task]} canEdit attendanceRunning currentUserId={userId} formattedDate={day}/>}
 </TaskTimerProvider></React.StrictMode>);
