import 'server-only';
import {db} from '@/lib/db';
import {getServerAuthContext} from '@/lib/auth/server';
import {employeeScope} from '@/lib/auth/policy';
import {NextResponse} from 'next/server';
import {z} from 'zod';
import {toDateOnly} from '@/lib/utils';
import {embedReopenMeta,stripReopenMeta} from '@/lib/task-reopen';
import {AccessError,audit,checkOrigin,fail,freshActor} from './server';
import {readChecklist} from './task-insights';
import {buildAssignmentReviewReason,ASSIGNMENT_REVIEW_PREFIX} from '@/lib/assignment-review';
import {timerCommandSchema,timerTaskInclude,taskTimerRevision,stateForDay,settlePastTaskTimers,writeTaskTimerState,taskTimerSnapshot,taskAttendanceRunning} from '@/lib/task-timer-service';
import {pauseTimerState} from '@/lib/task-timer-state';

export async function taskLifecycle(request:Request,id:string,management=false){try{
 checkOrigin(request);const {user}=await getServerAuthContext();if(!user)throw new AccessError('Please sign in.',401);
 if(!z.string().uuid().safeParse(id).success)throw new AccessError('Invalid task.',400);
 const body=await request.json().catch(()=>null);if(!body||typeof body!=='object')throw new AccessError('Invalid task request.',400);
 const action=management?'reopen_task':body.action;
 if(!['complete_task','reopen_task'].includes(action))throw new AccessError('Use Done or reason-required Reopen from your work plan.',400);
 if(body.completionStatus==='partial')throw new AccessError('Partial completion is not supported. Done means 100%.',400);
 if(['trackedMinutes','actualStart','actualEnd','trackedSeconds'].some(key=>key in body))throw new AccessError('Task time is server controlled. Refresh your task controls.',409);
 const command=management?z.object({commandId:z.string().uuid(),updatedAt:z.string().datetime()}).parse(body):timerCommandSchema.parse(body);
 if(!management&&'expectedUserId' in command&&command.expectedUserId!==user.id)throw new AccessError('Your session changed. Refresh before continuing.',409);
 const reason=String(management?body.reason??'':body.reopenReason??'').trim();
 if(action==='reopen_task'&&(reason.length<10||reason.length>500))throw new AccessError('Provide a reopen reason of 10-500 characters.',400);
 const note=String(body.completionNote??'').trim();if(note.length>10000)throw new AccessError('Completion note is too long.',400);
 const result=await db.$transaction(async tx=>{
  const owner=await tx.dailyTask.findUnique({where:{id},select:{userId:true}});if(!owner)throw new AccessError('Task not found.',404);
  await tx.$queryRaw`SELECT id FROM users WHERE id=${owner.userId}::uuid FOR UPDATE`;
  const actor=await freshActor(tx,user.id);
  await tx.$queryRaw`SELECT id FROM daily_tasks WHERE id=${id}::uuid FOR UPDATE`;
  const task=await tx.dailyTask.findFirst({where:{id,...(management?{user:employeeScope(actor,'tasks.reopen')}:{userId:actor.id})},include:timerTaskInclude});
  if(!task)throw new AccessError('Task not found in your scope.',404);
  const now=new Date(),today=toDateOnly(now),date=new Date(today),last=task.updates[0];
  if('reportDate' in command&&command.reportDate!==today)throw new AccessError('The workday changed. Refresh before continuing.',409);
  const timerAction=action==='complete_task'?'complete':'reopen';
  const previous=task.timerStates.find(s=>toDateOnly(s.reportDate)===today);
  if(previous?.lastCommandId===command.commandId&&previous.lastAction===timerAction)
   return {saved:task.updates.find(u=>toDateOnly(u.reportDate)===today)!,timer:taskTimerSnapshot(task,today,now,await taskAttendanceRunning(tx,task.userId))};
  if(('expectedRevision' in command&&taskTimerRevision(task,today)!==command.expectedRevision)||('updatedAt' in command&&task.updatedAt.toISOString()!==command.updatedAt))
   throw new AccessError('This task changed in another request. Refresh and review it before trying again.',409);
  if(task.planDate>date)throw new AccessError('This task is planned for a future workday.',409);
  const cycle=(await tx.taskActivityEvent.aggregate({where:{dailyTaskId:id,eventType:'completed'},_max:{cycle:true}}))._max.cycle??0;
  if(action==='complete_task'){
   if(last?.status==='done')throw new AccessError('This task is already completed.',409);
   if(readChecklist(task.checklist).some(i=>!i.done))throw new AccessError('Complete every checklist item before marking this task Done.',409);
  }else if(last?.status!=='done')throw new AccessError('Only a completed task can be reopened.',409);
  await settlePastTaskTimers(tx,task,now);
  const state=pauseTimerState(stateForDay(task,today),now);
  if(state.trackedMilliseconds>0&&!state.actualStart)throw new AccessError('Saved task time has no start record. Ask an authorized reviewer to investigate.',409);
  if(action==='complete_task')state.actualEnd=now;
  const status=action==='complete_task'?'done' as const:'in_progress' as const;
  await writeTaskTimerState(tx,task,state,timerAction,command.commandId,now,status,actor.id);
  const saved=await tx.dailyTaskUpdate.update({where:{dailyTaskId_reportDate:{dailyTaskId:id,reportDate:date}},data:{note:action==='complete_task'?(note||null):`Reopened: ${reason}`}});
  task.updates=task.updates.map(u=>u.id===saved.id?saved:u);
  await tx.dailyTask.update({where:{id},data:{taskDescription:action==='complete_task'?(stripReopenMeta(task.taskDescription)||null):embedReopenMeta(task.taskDescription)}});
  if(action==='complete_task'){
   await tx.taskActivityEvent.create({data:{dailyTaskId:id,actorId:actor.id,eventType:'completed',cycle:cycle+1,reportDate:date,trackedMinutes:saved.trackedMinutes,actualStart:saved.actualStart,actualEnd:now,note:note||null}});
   if(task.assignedBy){
    const pending=await tx.reportEditRequest.findFirst({where:{dailyTaskId:id,requestedById:actor.id,status:'pending',reason:{startsWith:ASSIGNMENT_REVIEW_PREFIX}}});
    const reviewReason=buildAssignmentReviewReason(note||'Task completed and submitted for review.');
    if(pending)await tx.reportEditRequest.update({where:{id:pending.id},data:{reason:reviewReason}});
    else await tx.reportEditRequest.create({data:{dailyTaskId:id,requestedById:actor.id,reason:reviewReason}});
   }
   await tx.taskTimelineEntry.create({data:{taskId:id,actorId:actor.id,eventType:'completed',note:note||null,snapshot:{title:task.taskTitle,description:task.taskDescription,checklist:task.checklist,completionPercent:100}}});
  }else{
   if(!cycle)await tx.taskActivityEvent.create({data:{dailyTaskId:id,actorId:actor.id,eventType:'completed',cycle:1,reportDate:last.reportDate,trackedMinutes:last.trackedMinutes,actualStart:last.actualStart,actualEnd:last.actualEnd,note:last.note,createdAt:last.updatedAt}});
   await tx.taskActivityEvent.create({data:{dailyTaskId:id,actorId:actor.id,eventType:'reopened',cycle:cycle||1,reason,reportDate:date,trackedMinutes:last.trackedMinutes,actualStart:last.actualStart,actualEnd:last.actualEnd}});
   await tx.taskTimelineEntry.create({data:{taskId:id,actorId:actor.id,eventType:'reopened',note:reason,snapshot:{previousStatus:'done',previousNote:last.note,previousCompletedAt:last.actualEnd?.toISOString()??null}}});
   if(management)await audit(tx,actor.id,task.userId,'task.reopened',last,{taskId:id,status:'in_progress'},reason);
  }
  return {saved,timer:taskTimerSnapshot(task,today,now,await taskAttendanceRunning(tx,task.userId))};
 },{isolationLevel:'ReadCommitted',timeout:20000});
 const {saved,timer}=result;
 return NextResponse.json({timer,taskUpdate:{reportDate:toDateOnly(saved.reportDate),status:saved.status,trackedMinutes:saved.trackedMinutes,actualStart:saved.actualStart?.toISOString()??null,actualEnd:saved.actualEnd?.toISOString()??null,note:saved.note??null},message:action==='complete_task'?'Task completed. History and reports are updated.':'Task reopened. Previous completion remains in History.'});
}catch(e){return e instanceof z.ZodError?NextResponse.json({message:'Task controls were updated. Refresh and try again.'},{status:409}):fail(e);}}
