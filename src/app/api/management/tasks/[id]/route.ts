import {NextResponse} from 'next/server';
import {z} from 'zod';
import {db} from '@/lib/db';
import {employeeScope} from '@/lib/auth/policy';
import {authenticate,freshActor,checkOrigin,audit,fail,AccessError} from '@/lib/management/server';
import {replaceReadableTaskDescription} from '@/lib/task-description-edit';
const editSchema=z.object({title:z.string().trim().min(3).max(300),description:z.string().max(10000),priority:z.enum(['low','normal','high','critical']),reason:z.string().trim().min(10).max(1000),updatedAt:z.string().datetime({offset:true})});
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){try{
 checkOrigin(request);const actor=await authenticate('tasks.update');const {id}=await params;const p=editSchema.safeParse(await request.json());if(!p.success)throw new AccessError('Provide task details and a reason of at least 10 characters.',400);
 await db.$transaction(async tx=>{const fresh=await freshActor(tx,actor.id);await tx.$queryRaw`SELECT id::text FROM daily_tasks WHERE id=${id}::uuid FOR UPDATE`;const task=await tx.dailyTask.findFirst({where:{id,user:employeeScope(fresh,'tasks.update')},include:{updates:{orderBy:{reportDate:'desc'},take:1}}});if(!task)throw new AccessError('Task access denied.');if(task.updatedAt.toISOString()!==p.data.updatedAt)throw new AccessError('Task changed. Refresh before editing.',409);if(task.updates[0]?.status==='done')throw new AccessError('Reopen before editing a completed task.',409);const updated=await tx.dailyTask.update({where:{id},data:{taskTitle:p.data.title,taskDescription:replaceReadableTaskDescription(task.taskDescription,p.data.description),priority:p.data.priority}});await tx.taskTimelineEntry.create({data:{taskId:id,actorId:actor.id,eventType:'details_updated',note:p.data.reason,snapshot:{title:task.taskTitle,description:task.taskDescription,priority:task.priority,newTitle:updated.taskTitle,newDescription:updated.taskDescription,newPriority:updated.priority}}});await audit(tx,actor.id,task.userId,'task.updated',task,updated,p.data.reason);},{isolationLevel:'Serializable'});
 return NextResponse.json({message:'Task details updated.'});
}catch(e){return fail(e);}}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){const {taskLifecycle}=await import('@/lib/management/task-lifecycle');return taskLifecycle(request,(await params).id,true);}
