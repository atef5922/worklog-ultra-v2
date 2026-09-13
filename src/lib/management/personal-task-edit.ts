import 'server-only';
import {NextResponse} from 'next/server';
import {z} from 'zod';
import {db} from '@/lib/db';
import {getServerAuthContext} from '@/lib/auth/server';
import {replaceReadableTaskDescription} from '@/lib/task-description-edit';
import {AccessError,checkOrigin,fail,freshActor} from './server';
const schema=z.object({taskTitle:z.string().trim().min(3).max(300).optional(),taskDescription:z.string().max(10000).optional(),priority:z.enum(['low','normal','high','critical']).optional()}).refine(v=>Object.keys(v).length>0);
export async function editPersonalTask(request:Request,id:string){try{
 checkOrigin(request);const {user}=await getServerAuthContext();if(!user)throw new AccessError('Please sign in.',401);
 const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success||!z.string().uuid().safeParse(id).success)throw new AccessError('Invalid task details.',400);
 const updated=await db.$transaction(async tx=>{
  await freshActor(tx,user.id);await tx.$queryRaw`SELECT id FROM daily_tasks WHERE id=${id}::uuid FOR UPDATE`;
  const task=await tx.dailyTask.findFirst({where:{id,userId:user.id},include:{updates:{orderBy:[{reportDate:'desc'},{updatedAt:'desc'}],take:1}}});
  if(!task)throw new AccessError('Task not found.',404);if(task.assignedBy&&task.assignedBy!==user.id)throw new AccessError('Assigned task details are read-only.');if(task.updates[0]?.status==='done')throw new AccessError('Reopen before editing a completed task.',409);
  if(parsed.data.taskTitle&&await tx.dailyTask.findFirst({where:{id:{not:id},userId:user.id,planDate:task.planDate,taskTitle:{equals:parsed.data.taskTitle,mode:'insensitive'}}}))throw new AccessError('This task title already exists for that day.',409);
  const data={...parsed.data,...(parsed.data.taskDescription===undefined?{}:{taskDescription:replaceReadableTaskDescription(task.taskDescription,parsed.data.taskDescription)||null})};
  const row=await tx.dailyTask.update({where:{id},data,select:{id:true,taskTitle:true,taskDescription:true,priority:true}});
  await tx.taskTimelineEntry.create({data:{taskId:id,actorId:user.id,eventType:'details_updated',snapshot:{before:{title:task.taskTitle,description:task.taskDescription,priority:task.priority},after:row}}});return row;
 },{isolationLevel:'Serializable'});
 return NextResponse.json({message:'Task updated successfully.',task:updated});
}catch(e){return fail(e);}}
