import 'server-only';
import {NextResponse} from 'next/server';
import {getServerAuthContext} from '@/lib/auth/server';
import {db} from '@/lib/db';
import {reportSubmissionSchema} from '@/lib/validators/worklog';
import {toDateOnly,parseDhakaDateTime} from '@/lib/utils';
import {buildAssignmentReviewReason,ASSIGNMENT_REVIEW_PREFIX} from '@/lib/assignment-review';
import {AccessError,checkOrigin,fail,freshActor} from './server';
import {readChecklist,taskProgress} from './task-insights';
export async function savePersonalReport(request:Request){try{
 checkOrigin(request);const {user}=await getServerAuthContext();if(!user)throw new AccessError('Please sign in.',401);
 const parsed=reportSubmissionSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)throw new AccessError(parsed.error.issues[0]?.message??'Invalid report.',400);
 const input=parsed.data,today=toDateOnly(),day=input.reportDate,date=new Date(day),historical=day!==today;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==day||day>today)throw new AccessError('Invalid report workday.',400);
 if(new Set(input.updates.map(u=>u.dailyTaskId)).size!==input.updates.length||input.updates.length>100)throw new AccessError('Choose up to 100 unique tasks.',400);
 await db.$transaction(async tx=>{
  await freshActor(tx,user.id);
  for(const update of [...input.updates].sort((a,b)=>a.dailyTaskId.localeCompare(b.dailyTaskId))){
   await tx.$queryRaw`SELECT id FROM daily_tasks WHERE id=${update.dailyTaskId}::uuid FOR UPDATE`;
   const task=await tx.dailyTask.findFirst({where:{id:update.dailyTaskId,userId:user.id},include:{updates:{orderBy:[{reportDate:'desc'},{updatedAt:'desc'}],take:1}}});
   if(!task)throw new AccessError('Task not found.',404);
   const latest=task.updates[0],sameDay=latest?.reportDate.toISOString().slice(0,10)===day;
   if(historical&&(!sameDay||!latest?.actualStart||latest.actualEnd||latest.status!=='in_progress'||!update.actualEnd||update.status!=='in_progress'))throw new AccessError('Historical reports are read-only.',409);
   if(task.planDate>date)throw new AccessError('Task is planned for a future day.',409);
   // Timer/report submissions can never overwrite completion or bypass its audit trail.
   if(latest?.status==='done'||update.status==='done')throw new AccessError('Use the Done or reason-required Reopen action from the work plan.',409);
   if(update.status==='pending'&&latest?.status==='in_progress')throw new AccessError('Started work cannot be reset to Pending.',409);
   const start=update.actualStart?parseDhakaDateTime(update.actualStart):sameDay?latest?.actualStart??null:null;
   const end=update.actualEnd?parseDhakaDateTime(update.actualEnd):null;
   const now=new Date(),dayStart=new Date(`${day}T00:00:00+06:00`);
   if((update.actualStart&&!start)||(update.actualEnd&&!end)||(start&&(start<dayStart||start>now))||(end&&(!start||end<start||end>now||end.getTime()>dayStart.getTime()+86400000)))throw new AccessError('Invalid task time range.',400);
   if(end&&sameDay&&latest?.actualEnd&&end<latest.actualEnd)throw new AccessError('A newer timer update is already saved. Refresh before retrying.',409);
   const trackedMinutes=Math.max(sameDay?latest?.trackedMinutes??0:0,Math.floor(update.trackedMinutes));
   if(start&&trackedMinutes>Math.ceil(((end??now).getTime()-start.getTime())/60000))throw new AccessError('Tracked time exceeds this task’s time window.',400);
   if(!start&&trackedMinutes)throw new AccessError('A task start time is required for tracked work.',400);
   if(historical&&start?.getTime()!==latest?.actualStart?.getTime())throw new AccessError('Historical start time cannot be changed.',409);
   const progress=taskProgress(update.status,readChecklist(task.checklist))??0;
   const payload={status:update.status,completionPercent:progress,trackedMinutes,actualStart:start??null,actualEnd:end,...(historical||update.note===undefined?{}:{note:update.note||null}),...(historical||update.difficultyLevel===undefined?{}:{difficultyLevel:update.difficultyLevel||null})};
   await tx.dailyTaskUpdate.upsert({where:{dailyTaskId_reportDate:{dailyTaskId:task.id,reportDate:date}},create:{dailyTaskId:task.id,reportDate:date,...payload},update:payload});
   const transition=update.status!==latest?.status||!!end!==!!latest?.actualEnd||!!start!==!!latest?.actualStart;
   if(transition)await tx.taskTimelineEntry.create({data:{taskId:task.id,actorId:user.id,eventType:end?'timer_paused':'timer_started',snapshot:{reportDate:day,trackedMinutes,actualStart:start?.toISOString()??null,actualEnd:end?.toISOString()??null}}});
   // Preserve the existing assignment review workflow, but don't create approvals for timer ticks.
   if(task.assignedBy&&update.note?.trim()){
    const pending=await tx.reportEditRequest.findFirst({where:{dailyTaskId:task.id,requestedById:user.id,status:'pending',reason:{startsWith:ASSIGNMENT_REVIEW_PREFIX}}});
    const reason=buildAssignmentReviewReason(update.note.trim());
    if(pending)await tx.reportEditRequest.update({where:{id:pending.id},data:{reason}});
    else await tx.reportEditRequest.create({data:{dailyTaskId:task.id,requestedById:user.id,reason}});
   }
  }
 },{isolationLevel:'Serializable'});
 return NextResponse.json({message:'Task progress saved.'});
}catch(e){return fail(e);}}
