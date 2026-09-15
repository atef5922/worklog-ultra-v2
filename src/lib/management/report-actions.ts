import 'server-only';
import {NextResponse} from 'next/server';
import {z} from 'zod';
import {getServerAuthContext} from '@/lib/auth/server';
import {db} from '@/lib/db';
import {toDateOnly} from '@/lib/utils';
import {AccessError,checkOrigin,fail,freshActor} from './server';
import {timerTaskInclude,taskTimerRevision,taskTimerSnapshot,taskAttendanceRunning} from '@/lib/task-timer-service';
const noteSchema=z.object({action:z.literal('save_note'),taskId:z.string().uuid(),reportDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
 expectedUserId:z.string().uuid(),expectedRevision:z.string().regex(/^[a-f0-9]{64}$/),note:z.string().max(10000)}).strict();
export async function savePersonalReport(request:Request){try{
 checkOrigin(request);const {user}=await getServerAuthContext();if(!user)throw new AccessError('Please sign in.',401);
 const parsed=noteSchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)throw new AccessError('Task time is server controlled. Refresh and use Start, Pause or Done.',409);
 const input=parsed.data;if(input.expectedUserId!==user.id)throw new AccessError('Your session changed. Refresh before continuing.',409);
 const timer=await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM users WHERE id=${user.id}::uuid FOR UPDATE`;await freshActor(tx,user.id);
  await tx.$queryRaw`SELECT id FROM daily_tasks WHERE id=${input.taskId}::uuid FOR UPDATE`;
  const task=await tx.dailyTask.findFirst({where:{id:input.taskId,userId:user.id},include:timerTaskInclude});
  if(!task)throw new AccessError('Task not found.',404);
  const now=new Date(),today=toDateOnly(now),date=new Date(today);
  if(input.reportDate!==today)throw new AccessError('Historical reports are read-only.',409);
  if(task.planDate>date)throw new AccessError('Task is planned for a future day.',409);
  if(task.updates[0]?.status==='done')throw new AccessError('Completed records are read-only. Use reason-required Reopen.',409);
  if(taskTimerRevision(task,today)!==input.expectedRevision)throw new AccessError('Task changed. Refresh before saving the note.',409);
  const saved=await tx.dailyTaskUpdate.upsert({where:{dailyTaskId_reportDate:{dailyTaskId:task.id,reportDate:date}},
    create:{dailyTaskId:task.id,reportDate:date,status:task.updates[0]?.status??'pending',note:input.note||null},
    update:{note:input.note||null}});
  task.updates=[saved,...task.updates.filter(u=>u.id!==saved.id)];
  await tx.taskTimelineEntry.create({data:{taskId:task.id,actorId:user.id,eventType:'note_updated',note:input.note||null,snapshot:{reportDate:today}}});
  return taskTimerSnapshot(task,today,now,await taskAttendanceRunning(tx,user.id));
 },{isolationLevel:'ReadCommitted'});
 return NextResponse.json({message:'Work note saved. Timer state is unchanged.',timer});
}catch(e){return fail(e);}}
