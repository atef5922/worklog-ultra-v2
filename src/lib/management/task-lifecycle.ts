import 'server-only';
import {db} from '@/lib/db';
import {getServerAuthContext} from '@/lib/auth/server';
import {employeeScope} from '@/lib/auth/policy';
import {NextResponse} from 'next/server';
import {z} from 'zod';
import {toDateOnly,parseDhakaDateTime} from '@/lib/utils';
import {embedReopenMeta,stripReopenMeta} from '@/lib/task-reopen';
import {AccessError,audit,checkOrigin,fail,freshActor} from './server';
import {readChecklist} from './task-insights';
import {buildAssignmentReviewReason,ASSIGNMENT_REVIEW_PREFIX} from '@/lib/assignment-review';
export async function taskLifecycle(request:Request,id:string,management=false){try{
 checkOrigin(request);const {user}=await getServerAuthContext();if(!user)throw new AccessError('Please sign in.',401);
 if(!z.string().uuid().safeParse(id).success)throw new AccessError('Invalid task.',400);
 const body=await request.json().catch(()=>null);if(!body)throw new AccessError('Invalid task request.',400);
 const action=management?'reopen_task':body.action;
 if(!['complete_task','reopen_task'].includes(action))throw new AccessError('Use Done or reason-required Reopen from your work plan.',400);
 if(body.completionStatus==='partial')throw new AccessError('Partial completion is not supported. Done means 100%.',400);
 const reason=String(management?body.reason??'':body.reopenReason??'').trim();
 if(action==='reopen_task'&&(reason.length<10||reason.length>500))throw new AccessError('Provide a reopen reason of 10–500 characters.',400);
 const note=String(body.completionNote??'').trim();if(note.length>10000)throw new AccessError('Completion note is too long.',400);
 await db.$transaction(async tx=>{
  const actor=await freshActor(tx,user.id);await tx.$queryRaw`SELECT id FROM daily_tasks WHERE id=${id}::uuid FOR UPDATE`;
  const task=await tx.dailyTask.findFirst({where:{id,...(management?{user:employeeScope(actor,'tasks.reopen')}:{userId:actor.id})},include:{updates:{orderBy:[{reportDate:'desc'},{updatedAt:'desc'}],take:1}}});
  if(!task)throw new AccessError('Task not found in your scope.',404);
  const last=task.updates[0],today=toDateOnly(),date=new Date(today),now=new Date();
  const sameDay=last?.reportDate.toISOString().slice(0,10)===today;
  if(task.planDate>date)throw new AccessError('This task is planned for a future workday.',409);
  const previousCycle=(await tx.taskActivityEvent.aggregate({where:{dailyTaskId:id,eventType:'completed'},_max:{cycle:true}}))._max.cycle??0;
  if(action==='complete_task'){
   if(last?.status==='done')return; // Retry-safe: a second click cannot create another completion cycle.
   if(readChecklist(task.checklist).some(i=>!i.done))throw new AccessError('Complete every checklist item before marking this task Done.',409);
   const supplied=body.trackedMinutes===undefined?0:Number(body.trackedMinutes);
   if(!Number.isFinite(supplied)||supplied<0||supplied>1440)throw new AccessError('Invalid tracked time.',400);
   const start=body.actualStart?parseDhakaDateTime(String(body.actualStart)):(sameDay?last?.actualStart:null);
   if(start&&(start>now||start<new Date(`${today}T00:00:00+06:00`)))throw new AccessError('Task start time is outside this workday.',400);
   const minutes=Math.max(sameDay?last?.trackedMinutes??0:0,Math.floor(supplied));
   if(start&&minutes>Math.ceil((now.getTime()-start.getTime())/60000))throw new AccessError('Tracked time exceeds the task time window.',400);
   const data={status:'done' as const,completionPercent:100,trackedMinutes:minutes,actualStart:start??null,actualEnd:now,note:note||null};
   await tx.dailyTaskUpdate.upsert({where:{dailyTaskId_reportDate:{dailyTaskId:id,reportDate:date}},create:{dailyTaskId:id,reportDate:date,...data},update:data});
   await tx.dailyTask.update({where:{id},data:{taskDescription:stripReopenMeta(task.taskDescription)||null}});
   await tx.taskActivityEvent.create({data:{dailyTaskId:id,actorId:actor.id,eventType:'completed',cycle:previousCycle+1,reportDate:date,trackedMinutes:minutes,actualStart:start??null,actualEnd:now,note:note||null}});
   if(task.assignedBy){
    const pending=await tx.reportEditRequest.findFirst({where:{dailyTaskId:id,requestedById:actor.id,status:'pending',reason:{startsWith:ASSIGNMENT_REVIEW_PREFIX}}});
    const reviewReason=buildAssignmentReviewReason(note||'Task completed and submitted for review.');
    if(pending)await tx.reportEditRequest.update({where:{id:pending.id},data:{reason:reviewReason}});
    else await tx.reportEditRequest.create({data:{dailyTaskId:id,requestedById:actor.id,reason:reviewReason}});
   }
   await tx.taskTimelineEntry.create({data:{taskId:id,actorId:actor.id,eventType:'completed',note:note||null,snapshot:{title:task.taskTitle,description:task.taskDescription,checklist:task.checklist,completionPercent:100}}});
  }else{
   if(last?.status!=='done')throw new AccessError('Only a completed task can be reopened.',409);
   let cycle=previousCycle;
   // Preserve legacy completion evidence before changing the current-day state.
   if(!cycle){cycle=1;await tx.taskActivityEvent.create({data:{dailyTaskId:id,actorId:actor.id,eventType:'completed',cycle,reportDate:last.reportDate,trackedMinutes:last.trackedMinutes,actualStart:last.actualStart,actualEnd:last.actualEnd,note:last.note,createdAt:last.updatedAt}});}
   const data={status:'in_progress' as const,completionPercent:0,trackedMinutes:sameDay?last.trackedMinutes:0,actualStart:sameDay?last.actualStart:null,actualEnd:sameDay?last.actualEnd:null,note:`Reopened: ${reason}`};
   await tx.dailyTaskUpdate.upsert({where:{dailyTaskId_reportDate:{dailyTaskId:id,reportDate:date}},create:{dailyTaskId:id,reportDate:date,...data},update:data});
   await tx.dailyTask.update({where:{id},data:{taskDescription:embedReopenMeta(task.taskDescription)}});
   await tx.taskActivityEvent.create({data:{dailyTaskId:id,actorId:actor.id,eventType:'reopened',cycle,reason,reportDate:date,trackedMinutes:last.trackedMinutes,actualStart:last.actualStart,actualEnd:last.actualEnd}});
   await tx.taskTimelineEntry.create({data:{taskId:id,actorId:actor.id,eventType:'reopened',note:reason,snapshot:{previousStatus:'done',previousNote:last.note,previousCompletedAt:last.actualEnd?.toISOString()??null}}});
   if(management)await audit(tx,actor.id,task.userId,'task.reopened',last,{taskId:id,status:'in_progress'},reason);
  }
 },{isolationLevel:'Serializable'});
 return NextResponse.json({message:action==='complete_task'?'Task completed. History and reports are updated.':'Task reopened. Previous completion remains in History.'});
}catch(e){return fail(e);}}
