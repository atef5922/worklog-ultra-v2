import "server-only";
import {projectTaskTimers,hasRunningTaskTimer} from "@/lib/task-timer-projection";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { can, employeeScope, type AccessActor } from "@/lib/auth/policy";
import { calculateSegmentedAttendanceMetrics } from "@/lib/attendance-policy";
import { toDateOnly } from "@/lib/utils";
import { getReadableTaskDescription } from "@/lib/report-summary";
import { AccessError } from "@/lib/management/server";
import { taskInPeriod } from "@/lib/management/task-insights";

export function dateRange(params: URLSearchParams) {
 const from=params.get('from')||toDateOnly(),to=params.get('to')||from;
 const valid=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(new Date(s).valueOf())&&new Date(s).toISOString().slice(0,10)===s;
 if(!valid(from)||!valid(to)||from>to||(new Date(to).valueOf()-new Date(from).valueOf())/86400000>365)throw new AccessError('Choose a valid date range of up to 366 days.',400);
 return {from,to};
}
export function recordMetrics(record: {attendanceDate:Date;legacyBreakMinutes:number;workSessions:{startedAt:Date;endedAt:Date|null}[];breakSessions:{startedAt:Date;endedAt:Date|null}[]}) {
 const date=toDateOnly(record.attendanceDate);
 // Attendance reports use the original workday, including its overnight sessions.
 return calculateSegmentedAttendanceMetrics({attendanceDate:date,workSessions:record.workSessions,breakSessions:record.breakSessions,legacyBreakMinutes:record.legacyBreakMinutes,now:new Date()});
}
export async function managementRecords(actor: AccessActor, params: URLSearchParams, reportMode=false) {
 const {from,to}=dateRange(params);
 const permission=reportMode?'reports.view':'employees.view';
 if(!can(actor,permission))throw new AccessError('This view has not been granted.');
 const where: Prisma.UserWhereInput={AND:[employeeScope(actor,permission),
  ...(params.get('departmentId')?[{departmentId:params.get('departmentId')!}]:[]),
  ...(params.get('teamId')?[{teamId:params.get('teamId')!}]:[]),
  ...(params.get('userId')?[{id:params.get('userId')!}]:[]),
  ...(params.get('role')?[{role:params.get('role') as Prisma.EnumUserRoleFilter['equals']}]:[]),
  ...(params.get('q')?[{name:{contains:params.get('q')!.slice(0,100),mode:'insensitive' as const}}]:[]),
 ]};
 const count=await db.user.count({where});
 if(count>5000)throw new AccessError('Select a department or team to narrow this report.',400);
 const attendanceAllowed=reportMode||can(actor,'attendance.view'),tasksAllowed=reportMode||can(actor,'tasks.view');
 const people=await db.user.findMany({where,orderBy:[{name:'asc'},{id:'asc'}],select:{id:true,name:true,role:true,isActive:true,createdAt:true,designation:true,department:{select:{id:true,name:true}},team:{select:{id:true,name:true}},
  attendanceRecords:{where:{id:attendanceAllowed?undefined:{in:[]},OR:[{attendanceDate:{gte:new Date(from),lte:new Date(to)}},...(from<=toDateOnly()&&to>=toDateOnly()?[{workSessions:{some:{endedAt:null}}}]:[])]},orderBy:{attendanceDate:'asc'},include:{workSessions:{orderBy:{startedAt:'asc'}},breakSessions:{orderBy:{startedAt:'asc'}}}},
  taskOwner:{where:{id:tasksAllowed?undefined:{in:[]},planDate:{lte:new Date(to)}},include:{timerStates:true,updates:{where:{reportDate:{lte:new Date(to)}},orderBy:[{reportDate:'desc'},{updatedAt:'desc'}]}}},
 }});
 const rows=people.map(person=>{
  const allAttendance=person.attendanceRecords??[];
  const attendance=allAttendance.filter(r=>toDateOnly(r.attendanceDate)>=from&&toDateOnly(r.attendanceDate)<=to);
  const metrics=attendance.map(recordMetrics);
  const sum=(key:'activeMinutes'|'workingMinutes'|'breakMinutes'|'includedBreakMinutes'|'excessBreakMinutes'|'outsideMinutes'|'overtimeMinutes')=>metrics.reduce((total,m)=>total+m[key],0);
  const last=allAttendance.find(r=>r.workSessions.some(s=>!s.endedAt))??attendance.at(-1),active=last?.workSessions.some(s=>!s.endedAt)??false,onBreak=active&&(last?.breakSessions.some(s=>!s.endedAt)??false);
  const todaySelected=to>=toDateOnly();
  const state=!last?'Not checked in':active&&todaySelected?(onBreak?'On break':'Working'):last.workSessions.some(s=>!s.endedAt)?'Open session':'Checked out';
  const tasks=(person.taskOwner??[]).map(t=>projectTaskTimers(t)).filter(t=>toDateOnly(t.planDate)>=from||t.updates.some(u=>toDateOnly(u.reportDate)>=from)||t.updates[0]?.status!=='done');
  const completed=tasks.filter(t=>t.updates[0]?.status==='done').length;
  const pending=tasks.filter(t=>!t.updates[0]||t.updates[0].status==='pending').length;
  const trackedMinutes=tasks.reduce((sum,t)=>sum+t.updates.filter(u=>toDateOnly(u.reportDate)>=from).reduce((s,u)=>s+u.trackedMinutes,0),0);
  const first=attendance.flatMap(r=>r.workSessions).at(0)?.startedAt??null;
  const lastOut=active?null:attendance.flatMap(r=>r.workSessions).at(-1)?.endedAt??null;
  const lateDays=attendance.filter(r=>{const start=r.workSessions[0]?.startedAt;return start&&start>new Date(`${toDateOnly(r.attendanceDate)}T10:00:00+06:00`);}).length;
  const flags:string[]=[];
  if(attendanceAllowed){if(!last)flags.push('Not checked in');if(lateDays)flags.push(`${lateDays} late check-in day(s)`);if(sum('excessBreakMinutes'))flags.push('Extra break');if(sum('outsideMinutes'))flags.push('Outside gap');if(sum('overtimeMinutes'))flags.push('Overtime');}
  if(tasksAllowed&&pending)flags.push(`${pending} pending task(s)`);
  return {id:person.id,name:person.name,role:person.role,isActive:person.isActive,department:person.department,team:person.team,state:attendanceAllowed?state:null,firstIn:first,lastOut,
   actual:attendanceAllowed?sum('activeMinutes'):null,counted:attendanceAllowed?sum('workingMinutes'):null,break:attendanceAllowed?sum('breakMinutes'):null,includedBreak:attendanceAllowed?sum('includedBreakMinutes'):null,extraBreak:attendanceAllowed?sum('excessBreakMinutes'):null,outside:attendanceAllowed?sum('outsideMinutes'):null,overtime:attendanceAllowed?sum('overtimeMinutes'):null,
   planned:tasksAllowed?tasks.length:null,completed:tasksAllowed?completed:null,pending:tasksAllowed?pending:null,inProgress:tasksAllowed?tasks.length-completed-pending:null,tracked:tasksAllowed?trackedMinutes:null,flags,
   currentTasks:tasksAllowed?tasks.filter(t=>hasRunningTaskTimer(t)).map(t=>t.taskTitle):[],
  };
 }).filter(r=>(!params.get('status')||r.state===params.get('status'))&&(!params.get('taskStatus')||(params.get('taskStatus')==='pending'?(r.pending??0)>0:params.get('taskStatus')==='completed'?(r.completed??0)>0:(r.inProgress??0)>0)));
 return {from,to,rows,attendanceAllowed,tasksAllowed};
}
export async function employeeDetails(actor:AccessActor,id:string,params:URLSearchParams){
 const {from,to}=dateRange(params);
 const employee=await db.user.findFirst({where:{AND:[{id},employeeScope(actor,'employees.view')]},select:{id:true,name:true,email:true,departmentId:true,role:true,designation:true,phone:true,location:true,updatedAt:true,isActive:true,department:{select:{name:true}},team:{select:{name:true}},createdAt:true}});
 if(!employee)throw new AccessError('Employee not found in your scope.',404);
 const taskAccess=can(actor,'tasks.view'),attendanceAccess=can(actor,'attendance.view'),historyAccess=can(actor,'history.view');
 const [tasks,attendance,history]=await Promise.all([
  taskAccess?db.dailyTask.findMany({where:{userId:id,planDate:{lte:new Date(to)}},include:{timerStates:true,updates:{where:{reportDate:{lte:new Date(to)}},orderBy:[{reportDate:'desc'},{updatedAt:'desc'}]},assigner:{select:{name:true}}},orderBy:[{createdAt:'desc'},{id:'desc'}],take:20001}):[],
  attendanceAccess?db.attendanceRecord.findMany({where:{userId:id,attendanceDate:{gte:new Date(from),lte:new Date(to)}},include:{workSessions:{orderBy:{startedAt:'asc'}},breakSessions:{orderBy:{startedAt:'asc'}}},orderBy:{attendanceDate:'desc'}}):[],
  historyAccess?db.dailyTask.findMany({where:{userId:id,OR:[{activityEvents:{some:{reportDate:{gte:new Date(from),lte:new Date(to)}}}},{updates:{some:{status:'done',reportDate:{gte:new Date(from),lte:new Date(to)}}}}]},include:{activityEvents:{where:{reportDate:{gte:new Date(from),lte:new Date(to)}},orderBy:{createdAt:'asc'}},updates:{where:{reportDate:{gte:new Date(from),lte:new Date(to)}},orderBy:{reportDate:'desc'}}},orderBy:[{createdAt:'desc'},{id:'desc'}],take:501}):[],
 ]);
 if(tasks.length>20000||history.length>500)throw new AccessError('Too many records. Narrow the date range or use the paginated report.',400);
 const periodTasks=tasks.map(t=>projectTaskTimers(t)).filter(t=>taskInPeriod(t,from,to));
 if(periodTasks.length>500)throw new AccessError('More than 500 tasks match. Narrow the dates or use the paginated report.',400);
 return {employee,from,to,tasks:periodTasks.map(t=>({...t,taskDescription:getReadableTaskDescription(t.taskDescription)})),attendance:attendance.map(r=>({...r,metrics:recordMetrics(r)})),history,taskAccess,attendanceAccess,historyAccess};
}
