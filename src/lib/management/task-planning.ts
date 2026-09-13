import 'server-only';
import {db} from '@/lib/db';
import {getServerAuthContext} from '@/lib/auth/server';
import {employeeScope} from '@/lib/auth/policy';
import {AccessError,freshActor,audit,checkOrigin,fail} from './server';
import {planningSchema,readChecklist} from './task-insights';
import {NextResponse} from 'next/server';
import {z} from 'zod';
export async function saveTaskPlanning(request:Request,id:string){try{
 checkOrigin(request);const {user}=await getServerAuthContext();if(!user)throw new AccessError('Please sign in.',401);
 if(!z.string().uuid().safeParse(id).success)throw new AccessError('Invalid task.',400);
 const parsed=planningSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)throw new AccessError(parsed.error.issues[0]?.message??'Invalid planning details.',400);
 const input=parsed.data;
 await db.$transaction(async tx=>{
  const actor=await freshActor(tx,user.id);
  await tx.$queryRaw`SELECT id FROM daily_tasks WHERE id=${id}::uuid FOR UPDATE`;
  const task=await tx.dailyTask.findFirst({where:{id,OR:[{userId:actor.id},{user:employeeScope(actor,'tasks.update')}]},include:{updates:{orderBy:[{reportDate:'desc'},{updatedAt:'desc'}],take:1}}});
  if(!task)throw new AccessError('Task not found in your scope.',404);
  if(task.planningVersion!==input.version)throw new AccessError('Planning details changed. Reload before saving.',409);
  if(task.updates[0]?.status==='done')throw new AccessError('Completed task records are read-only. Reopen first.',409);
  const owner=task.userId===actor.id;
  if(!owner&&(input.reason?.length??0)<10)throw new AccessError('Management changes require a reason of at least 10 characters.',400);
  if(owner&&task.assignedBy&&task.assignedBy!==actor.id){
   const structure=(items:ReturnType<typeof readChecklist>)=>items.map(({id,title})=>({id,title}));
   if(input.projectName!==task.projectName||input.clientName!==task.clientName||input.dueAt!==task.dueAt?.toISOString()&&!(input.dueAt===null&&task.dueAt===null)||input.estimatedMinutes!==task.estimatedMinutes||JSON.stringify(structure(input.checklist))!==JSON.stringify(structure(readChecklist(task.checklist))))throw new AccessError('Assigned task planning is read-only. You may check off its checklist items.');
  }
  if(input.dueAt&&new Date(input.dueAt)<new Date(`${task.planDate.toISOString().slice(0,10)}T00:00:00+06:00`))throw new AccessError('Deadline cannot precede the planned workday.',400);
  const updated=await tx.dailyTask.update({where:{id},data:{projectName:input.projectName||null,clientName:input.clientName||null,dueAt:input.dueAt?new Date(input.dueAt):null,estimatedMinutes:input.estimatedMinutes,checklist:input.checklist,planningVersion:{increment:1}}});
  await tx.taskTimelineEntry.create({data:{taskId:id,actorId:actor.id,eventType:'planning_updated',note:input.reason||null,snapshot:{before:{projectName:task.projectName,clientName:task.clientName,dueAt:task.dueAt?.toISOString()??null,estimatedMinutes:task.estimatedMinutes,checklist:task.checklist},after:{...input}}}});
  if(!owner)await audit(tx,actor.id,task.userId,'task.planning_updated',{version:task.planningVersion},{version:updated.planningVersion},input.reason);
 },{isolationLevel:'Serializable'});
 return NextResponse.json({message:'Task planning saved.'});
}catch(e){return fail(e);}}
