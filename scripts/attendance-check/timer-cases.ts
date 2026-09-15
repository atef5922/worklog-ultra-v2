import {randomUUID} from 'node:crypto';
import {expect,it,vi} from 'vitest';
import {db} from '@/lib/db';
import {getTaskTimers,postTaskTimer} from '@/lib/task-timer-service';
import {taskLifecycle} from '@/lib/management/task-lifecycle';
import {postAttendance} from '@/lib/attendance-service';
import {savePersonalReport} from '@/lib/management/report-actions';
import {attendanceInclude,attendanceRevision} from '@/lib/attendance-record';
import {projectTaskTimers} from '@/lib/task-timer-projection';
import type {Actor} from '@/lib/management/server';

export function timerCases(employee:()=>Actor,run:<T>(actor:Actor,fn:()=>T)=>T){
 const day='2026-09-14', date=(s:string)=>new Date(s), headers={origin:'http://localhost:3000','Content-Type':'application/json'};
 const req=(body:unknown)=>new Request('http://localhost:3000/api/dashboard/tasks',{method:'POST',headers,body:JSON.stringify(body)});
 const asEmployee=<T>(fn:()=>T)=>run(employee(),fn);
 async function setup(){
  const department=await db.department.create({data:{name:'Timer test '+randomUUID()}});
  const attendance=await db.attendanceRecord.create({data:{userId:employee().id,attendanceDate:date(day),status:'present',workSessions:{create:{startedAt:date(day+'T10:00:00+06:00')}}},include:attendanceInclude});
  const task=await db.dailyTask.create({data:{userId:employee().id,departmentId:department.id,planDate:date(day),taskTitle:'Synthetic timer'}});
  return {task,attendance};
 }
 async function read(id:string,who=employee()){
  const response=await run(who,()=>getTaskTimers(new Request(`http://localhost:3000/api/dashboard/task-timers?ids=${id}&date=${day}&userId=${who.id}`)));
  expect(response.status).toBe(200);return (await response.json()).timers[0];
 }
 const command=(timer:Awaited<ReturnType<typeof read>>,action:string)=>({action,reportDate:day,expectedUserId:timer.userId,expectedRevision:timer.revision,commandId:randomUUID()});
 const timerPost=(id:string,input:unknown)=>asEmployee(()=>postTaskTimer(req(input),id));
 const lifecycle=(id:string,input:unknown)=>asEmployee(()=>taskLifecycle(req(input),id));

 it.each(['complete_task','reopen_task'])('rejects a stale open %s dialog after a newer task cycle without changing records',async action=>{
  const {task}=await setup();
  expect((await timerPost(task.id,command(await read(task.id),'start'))).status).toBe(200);
  const complete=async(note:string)=>expect((await lifecycle(task.id,{...command(await read(task.id),'complete_task'),completionStatus:'done',completionNote:note})).status).toBe(200);
  const reopen=async()=>expect((await lifecycle(task.id,{...command(await read(task.id),'reopen_task'),reopenReason:'A new cycle requires additional work'})).status).toBe(200);
  if(action==='reopen_task')await complete('First completion');
  const opened=await read(task.id),stale={...command(opened,action),...(action==='complete_task'?{completionStatus:'done',completionNote:'Old dialog note'}:{reopenReason:'Old dialog reason must not affect the new cycle'})};
  if(action==='complete_task')await complete('Other-tab completion');
  await reopen();
  expect((await timerPost(task.id,command(await read(task.id),'start'))).status).toBe(200);
  if(action==='reopen_task')await complete('Newest completed cycle');
  const latest=await read(task.id);
  const activityCount=await db.taskActivityEvent.count({where:{dailyTaskId:task.id}});
  const timelineCount=await db.taskTimelineEntry.count({where:{taskId:task.id}});
  for(let attempt=0;attempt<2;attempt++){
   expect((await lifecycle(task.id,stale)).status).toBe(409);
   expect(await read(task.id)).toMatchObject({revision:latest.revision,status:latest.status,note:latest.note,runningStartedAt:latest.runningStartedAt});
  }
  expect(await db.taskActivityEvent.count({where:{dailyTaskId:task.id}})).toBe(activityCount);
  expect(await db.taskTimelineEntry.count({where:{taskId:task.id}})).toBe(timelineCount);
 });
 it('retains midnight task pause while attendance continues overnight',async()=>{
  const {task}=await setup();vi.setSystemTime(date(day+'T23:59:30+06:00'));
  await timerPost(task.id,command(await read(task.id),'start'));
  vi.setSystemTime(date('2026-09-15T02:00:00+06:00'));
  const old=await read(task.id);expect(old).toMatchObject({trackedMilliseconds:30000,runningStartedAt:null,actualEnd:'2026-09-14T18:00:00.000Z'});
  const response=await asEmployee(()=>getTaskTimers(new Request(`http://localhost:3000/api/dashboard/task-timers?ids=${task.id}&date=2026-09-15&userId=${employee().id}`)));
  const next=(await response.json()).timers[0];expect(next.canStart).toBe(true);
  expect((await timerPost(task.id,{...command(next,'start'),reportDate:'2026-09-15'})).status).toBe(200);
  expect((await db.taskTimerState.findMany({where:{taskId:task.id,runningStartedAt:{not:null}}}))).toHaveLength(1);
  expect(await db.attendanceWorkSession.count({where:{attendanceRecord:{userId:employee().id},endedAt:null}})).toBe(1);
 });
 it('never stores tracked time without start evidence',async()=>{
  const {task}=await setup();
  await expect(db.taskTimerState.create({data:{taskId:task.id,reportDate:date(day),trackedMilliseconds:60000}})).rejects.toThrow();
 });
 it('serializes simultaneous Start and counts only one segment',async()=>{
  const {task}=await setup(),initial=await read(task.id);
  const responses=await Promise.all([timerPost(task.id,command(initial,'start')),timerPost(task.id,command(initial,'start'))]);
  expect(responses.map(r=>r.status).sort()).toEqual([200,409]);
  vi.setSystemTime(date(day+'T13:05:00+06:00'));
  expect((await read(task.id)).trackedMilliseconds).toBe(300000);
  expect(await db.taskTimerState.count({where:{taskId:task.id}})).toBe(1);
 });
 it('recovers server time after refresh and ignores the browser clock',async()=>{
  const {task}=await setup();expect((await timerPost(task.id,command(await read(task.id),'start'))).status).toBe(200);
  vi.setSystemTime(date(day+'T13:30:00+06:00'));
  const restored=await read(task.id);expect(restored.trackedMilliseconds).toBe(1800000);expect(restored.runningStartedAt).toBeTruthy();
  expect((await timerPost(task.id,{...command(restored,'pause'),trackedMilliseconds:99,actualStart:'2030-01-01'})).status).toBe(400);
  const stored=await db.dailyTask.findUniqueOrThrow({where:{id:task.id},include:{updates:true,timerStates:true}});
  expect(projectTaskTimers(stored).updates[0].trackedMinutes).toBe(30);
 });
 it('retains milliseconds across short segments without counting the paused gap',async()=>{
  const {task}=await setup();await timerPost(task.id,command(await read(task.id),'start'));
  vi.setSystemTime(date(day+'T13:00:00.500+06:00'));await timerPost(task.id,command(await read(task.id),'pause'));
  vi.setSystemTime(date(day+'T14:00:00+06:00'));await timerPost(task.id,command(await read(task.id),'start'));
  vi.setSystemTime(date(day+'T14:00:00.750+06:00'));await timerPost(task.id,command(await read(task.id),'pause'));
  expect((await read(task.id)).trackedMilliseconds).toBe(1250);
 });
 it('does not replay an old Pause against a newer resumed session',async()=>{
  const {task}=await setup();await timerPost(task.id,command(await read(task.id),'start'));
  const pause=command(await read(task.id),'pause');expect((await timerPost(task.id,pause)).status).toBe(200);
  expect((await timerPost(task.id,pause)).status).toBe(200);
  await timerPost(task.id,command(await read(task.id),'start'));
  expect((await timerPost(task.id,pause)).status).toBe(409);expect((await read(task.id)).runningStartedAt).toBeTruthy();
 });
 it('allows multiple independent running tasks and atomically pauses all at Out',async()=>{
  const {task,attendance}=await setup();const second=await db.dailyTask.create({data:{userId:employee().id,departmentId:task.departmentId,planDate:date(day),taskTitle:'Second timer'}});
  const results=await Promise.all([task,second].map(async t=>timerPost(t.id,command(await read(t.id),'start'))));expect(results.map(r=>r.status)).toEqual([200,200]);
  vi.setSystemTime(date(day+'T13:10:00+06:00'));
  expect((await asEmployee(()=>postAttendance(req({action:'check_out',attendanceDate:day,expectedUserId:employee().id,expectedRevision:attendanceRevision(attendance),eventId:randomUUID()})))).status).toBe(200);
  for(const t of [task,second]){const current=await read(t.id);expect(current).toMatchObject({trackedMilliseconds:600000,runningStartedAt:null,canStart:false});}
 });
 it('Start versus Break never leaves an active timer while on break',async()=>{
  const {task,attendance}=await setup(),initial=await read(task.id);
  const results=await Promise.all([timerPost(task.id,command(initial,'start')),asEmployee(()=>postAttendance(req({action:'break_start',attendanceDate:day,expectedUserId:employee().id,expectedRevision:attendanceRevision(attendance),eventId:randomUUID()})))]);
  expect(results[1].status).toBe(200);expect([200,409]).toContain(results[0].status);expect((await read(task.id)).runningStartedAt).toBeNull();
 });
 it('completes exactly once, preserves time on reopen, rejects an old Done replay',async()=>{
  const {task}=await setup();await timerPost(task.id,command(await read(task.id),'start'));
  vi.setSystemTime(date(day+'T13:01:30.500+06:00'));
  const done={...command(await read(task.id),'complete_task'),completionNote:'Verified'};
  expect((await lifecycle(task.id,done)).status).toBe(200);expect((await lifecycle(task.id,done)).status).toBe(200);
  expect(await db.taskActivityEvent.count({where:{dailyTaskId:task.id,eventType:'completed'}})).toBe(1);
  expect((await lifecycle(task.id,{...command(await read(task.id),'reopen_task'),reopenReason:'More verification needed'})).status).toBe(200);
  expect((await read(task.id))).toMatchObject({status:'in_progress',trackedMilliseconds:90500,runningStartedAt:null});
  expect((await lifecycle(task.id,done)).status).toBe(409);
 });
 it('rejects fabricated minutes with no start and blocks the old report endpoint',async()=>{
  const {task}=await setup();const done=command(await read(task.id),'complete_task');
  expect((await lifecycle(task.id,{...done,trackedMinutes:500})).status).toBe(409);
  expect((await asEmployee(()=>savePersonalReport(req({reportDate:day,updates:[{dailyTaskId:task.id,trackedMinutes:500}]})))).status).toBe(409);
  expect(await db.dailyTaskUpdate.count({where:{dailyTaskId:task.id}})).toBe(0);
  expect((await lifecycle(task.id,{...done,completionNote:'Completed without a timer'})).status).toBe(200);
  expect((await read(task.id))).toMatchObject({trackedMilliseconds:0,actualStart:null,status:'done'});
 });
 it('requires attendance for Start but permits Done without recorded time',async()=>{
  const {task,attendance}=await setup();await asEmployee(()=>postAttendance(req({action:'check_out',attendanceDate:day,expectedUserId:employee().id,expectedRevision:attendanceRevision(attendance),eventId:randomUUID()})));
  expect((await timerPost(task.id,command(await read(task.id),'start'))).status).toBe(409);
 });
 it('rejects another account and a stale workday',async()=>{
  const {task}=await setup(),initial=await read(task.id);
  expect((await timerPost(task.id,{...command(initial,'start'),expectedUserId:randomUUID()})).status).toBe(409);
  expect((await timerPost(task.id,{...command(initial,'start'),reportDate:'2026-09-13'})).status).toBe(409);
 });
 it('rolls back timer and attendance together when timeline storage fails',async()=>{
  const {task,attendance}=await setup();await timerPost(task.id,command(await read(task.id),'start'));
  await db.$executeRawUnsafe("CREATE FUNCTION reject_timer_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic timer audit failure'; END; $$");
  await db.$executeRawUnsafe('CREATE TRIGGER reject_timer_audit BEFORE INSERT ON task_timeline_entries FOR EACH ROW EXECUTE FUNCTION reject_timer_audit()');
  const log=vi.spyOn(console,'error').mockImplementation(()=>{});
  try{
   expect((await asEmployee(()=>postAttendance(req({action:'check_out',attendanceDate:day,expectedUserId:employee().id,expectedRevision:attendanceRevision(attendance),eventId:randomUUID()})))).status).toBe(500);
   expect((await read(task.id)).runningStartedAt).toBeTruthy();
   expect((await db.attendanceWorkSession.findFirstOrThrow({where:{attendanceRecordId:attendance.id}})).endedAt).toBeNull();
  }finally{log.mockRestore();await db.$executeRawUnsafe('DROP TRIGGER reject_timer_audit ON task_timeline_entries');await db.$executeRawUnsafe('DROP FUNCTION reject_timer_audit()');}
 });
}
