import 'server-only';
import {projectTaskTimers,hasRunningTaskTimer} from '@/lib/task-timer-projection';
import {db} from '@/lib/db';
import {can,employeeScope,type AccessActor} from '@/lib/auth/policy';
import {AccessError} from './server';
import {dateRange,recordMetrics} from './records';
import {readChecklist,taskProgress,deadlineState,presenceState,taskInPeriod} from './task-insights';
import {toDateOnly} from '@/lib/utils';
import {getReadableTaskDescription} from '@/lib/report-summary';

export async function dashboardData(actor:AccessActor,params:URLSearchParams){
 if(!can(actor,'employees.view'))throw new AccessError('Employee records access has not been granted.');
 const {from,to}=dateRange(params),today=toDateOnly(),now=new Date();
 const taskAccess=can(actor,'tasks.view'),attendanceAccess=can(actor,'attendance.view');
 const options=await db.user.findMany({where:{AND:[employeeScope(actor,'employees.view'),{isActive:true}]},orderBy:[{name:'asc'},{id:'asc'}],select:{id:true,name:true,department:{select:{id:true,name:true}}},take:5001});
 if(options.length>5000)throw new AccessError('This workspace needs a paginated employee directory before dashboard aggregation.',400);
 const filtered=options.filter(p=>(!params.get('userId')||p.id===params.get('userId'))&&(!params.get('departmentId')||p.department?.id===params.get('departmentId')));
 const ids=filtered.map(p=>p.id),end=new Date(to),start=new Date(from);
 const [tasks,attendance,livePeople]=await Promise.all([
  taskAccess?db.dailyTask.findMany({where:{userId:{in:ids},user:employeeScope(actor,'tasks.view'),planDate:{lte:end}},include:{timerStates:true,user:{select:{id:true,name:true,avatarUrl:true}},department:{select:{id:true,name:true}},updates:{where:{reportDate:{lte:end}},orderBy:[{reportDate:'desc'},{updatedAt:'desc'}]}},orderBy:[{createdAt:'desc'},{id:'asc'}],take:20001}):[],
  attendanceAccess?db.attendanceRecord.findMany({where:{userId:{in:ids},user:employeeScope(actor,'attendance.view'),attendanceDate:{gte:start,lte:end}},include:{workSessions:{orderBy:{startedAt:'asc'}},breakSessions:{orderBy:{startedAt:'asc'}}}}):[],
  attendanceAccess?db.user.findMany({where:{id:{in:ids},AND:[employeeScope(actor,'attendance.view')]},select:{id:true,name:true,avatarUrl:true,presence:true,attendanceRecords:{where:{OR:[{attendanceDate:new Date(today)},{workSessions:{some:{endedAt:null}}}]},orderBy:{attendanceDate:'desc'},include:{workSessions:{where:{endedAt:null}},breakSessions:{where:{endedAt:null}}}},taskOwner:{where:{id:taskAccess?undefined:{in:[]},timerStates:{some:{reportDate:new Date(today),runningStartedAt:{not:null}}}},select:{id:true,taskTitle:true,timerStates:true,updates:{orderBy:[{reportDate:'desc'},{updatedAt:'desc'}],take:1}}}}}):[],
 ]);
 if(tasks.length>20000)throw new AccessError('Select a smaller employee or department scope; more than 20,000 task records match.',400);
 const asOf=new Date(Math.min(now.getTime(),new Date(`${to}T23:59:59.999+06:00`).getTime()));
 const allTasks=tasks.map(t=>projectTaskTimers(t,now)).filter(t=>taskInPeriod(t,from,to));
 const taskRows=allTasks.map(task=>{
 const latest=task.updates[0],status=latest?.status??'pending',checklist=readChecklist(task.checklist);
 const minutes=task.updates.filter(u=>u.reportDate>=start).reduce((sum,u)=>sum+u.trackedMinutes,0);
  const totalTrackedMinutes=task.updates.reduce((sum,u)=>sum+u.trackedMinutes,0);
  return {id:task.id,title:task.taskTitle,description:getReadableTaskDescription(task.taskDescription),project:task.projectName,client:task.clientName,userId:task.userId,employee:task.user.name,avatar:task.user.avatarUrl,departmentId:task.departmentId,department:task.department.name,priority:task.priority,status,deadline:task.dueAt?.toISOString()??null,deadlineState:deadlineState(status,task.dueAt,asOf),progress:taskProgress(status,checklist),checklistDone:checklist.filter(i=>i.done).length,checklistTotal:checklist.length,estimatedMinutes:task.estimatedMinutes,trackedMinutes:minutes,totalTrackedMinutes,lastUpdate:(latest?.updatedAt??task.updatedAt).toISOString(),canPlan:task.userId===actor.id||can(actor,'tasks.update')};
 }).filter(t=>(!params.get('taskStatus')||t.status===params.get('taskStatus'))&&(!params.get('priority')||t.priority===params.get('priority'))&&(!params.get('attention')||t.deadlineState===params.get('attention'))&&(!params.get('q')||`${t.title} ${t.employee} ${t.project??''} ${t.client??''}`.toLowerCase().includes(params.get('q')!.toLowerCase().slice(0,100))));
 const attendanceMetrics=attendance.map(a=>({record:a,metrics:recordMetrics(a)}));
 const live=livePeople.map(person=>{
  const a=person.attendanceRecords.find(r=>r.workSessions.some(s=>!s.endedAt))??person.attendanceRecords[0],session=a?.workSessions.find(s=>!s.endedAt);
  const running=person.taskOwner.filter(t=>t.updates[0]?.status==='in_progress'&&hasRunningTaskTimer(t,now));
  return {id:person.id,name:person.name,avatar:person.avatarUrl,...presenceState({checkedIn:!!session,hasAttendance:!!a?.checkInAt,onBreak:!!a?.breakSessions.length,runningTasks:running.length,meetingStartedAt:person.presence?.meetingStartedAt??null,sessionStartedAt:session?.startedAt??null,lastSeenAt:person.presence?.lastSeenAt??null},now),tasks:running.map(t=>t.taskTitle)};
 });
 const employees=filtered.map(p=>{const own=taskRows.filter(t=>t.userId===p.id),completed=own.filter(t=>t.status==='done').length;const work=attendanceMetrics.filter(a=>a.record.userId===p.id);return {id:p.id,name:p.name,department:p.department?.name??'No department',departmentId:p.department?.id??'',assigned:own.length,completed,pending:own.filter(t=>t.status==='pending').length,inProgress:own.filter(t=>t.status==='in_progress').length,overdue:own.filter(t=>t.deadlineState==='overdue').length,trackedMinutes:own.reduce((n,t)=>n+t.trackedMinutes,0),countedMinutes:work.reduce((n,a)=>n+a.metrics.workingMinutes,0),completionRate:own.length?Math.round(completed/own.length*100):null};});
 const departments=[...new Map(filtered.filter(p=>p.department).map(p=>[p.department!.id,p.department!])).values()].map(d=>{const members=employees.filter(e=>e.departmentId===d.id),assigned=members.reduce((n,e)=>n+e.assigned,0),completed=members.reduce((n,e)=>n+e.completed,0);return {...d,employees:members.length,assigned,completed,pending:members.reduce((n,e)=>n+e.pending,0),completionRate:assigned?Math.round(completed/assigned*100):null};});
 const week=Array.from({length:7},(_,i)=>{const day=new Date(end);day.setUTCDate(day.getUTCDate()-6+i);const key=day.toISOString().slice(0,10);const daily=tasks.filter(t=>taskInPeriod(t,key,key)).map(t=>({task:t,latest:t.updates.find(u=>u.reportDate<=day)}));return {date:key,completed:daily.filter(t=>t.latest?.status==='done').length,inProgress:daily.filter(t=>t.latest?.status==='in_progress').length,pending:daily.filter(t=>!t.latest||t.latest.status==='pending').length};});
 const present=new Set(attendance.filter(a=>a.workSessions.length).map(a=>a.userId)).size;
 return {from,to,generatedAt:now.toISOString(),taskAccess,attendanceAccess,canExport:can(actor,'reports.view')&&can(actor,'reports.export'),options:{employees:options.map(p=>({id:p.id,name:p.name})),departments:[...new Map(options.filter(p=>p.department).map(p=>[p.department!.id,p.department!])).values()]},kpis:{employees:filtered.length,present,tasks:taskRows.length,completed:taskRows.filter(t=>t.status==='done').length,inProgress:taskRows.filter(t=>t.status==='in_progress').length,pending:taskRows.filter(t=>t.status==='pending').length,overdue:taskRows.filter(t=>t.deadlineState==='overdue').length},attention:{urgent:taskRows.filter(t=>t.deadlineState==='urgent').length,extraBreak:new Set(attendanceMetrics.filter(a=>a.metrics.excessBreakMinutes>0).map(a=>a.record.userId)).size,stale:live.filter(p=>!p.connected&&!['Not checked in','Checked out'].includes(p.state)).length},taskRows,live,employees,departments,week,attendance:{present,notCheckedIn:Math.max(0,filtered.length-present),late:new Set(attendance.filter(a=>a.workSessions[0]?.startedAt>new Date(`${a.attendanceDate.toISOString().slice(0,10)}T10:00:00+06:00`)).map(a=>a.userId)).size,countedMinutes:attendanceMetrics.reduce((n,a)=>n+a.metrics.workingMinutes,0),excessBreakMinutes:attendanceMetrics.reduce((n,a)=>n+a.metrics.excessBreakMinutes,0)}};
}
export type ManagementDashboardData=Awaited<ReturnType<typeof dashboardData>>;
