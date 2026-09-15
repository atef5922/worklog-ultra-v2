import 'server-only';
import {getServerAuthContext} from '@/lib/auth/server';
import {assigneeScope} from '@/lib/auth/policy';
import {db} from '@/lib/db';
import {planSubmissionSchema} from '@/lib/validators/worklog';
import {AccessError,checkOrigin,fail,freshActor,audit,lockTransaction} from './server';
import {NextResponse} from 'next/server';
export async function createWorkPlan(request:Request){try{
 checkOrigin(request);const {user}=await getServerAuthContext();if(!user)throw new AccessError('Please sign in.',401);
 const parsed=planSubmissionSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)throw new AccessError(parsed.error.issues[0]?.message??'Invalid plan.',400);
 const input=parsed.data;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(input.planDate)||!Number.isFinite(new Date(input.planDate).getTime())||new Date(input.planDate).toISOString().slice(0,10)!==input.planDate||input.tasks.length>100)throw new AccessError('Choose a valid workday and up to 100 tasks.',400);
 const keys=input.tasks.map(t=>`${t.assigneeId??user.id}:${t.taskTitle.toLowerCase()}`);
 if(new Set(keys).size!==keys.length)throw new AccessError('The same task was added twice.',409);
 const tasks=await db.$transaction(async tx=>{
  const actor=await freshActor(tx,user.id),ids=[...new Set(input.tasks.map(t=>t.assigneeId??user.id))].sort();
  // Coordinate both personal and assigned plan batches for the same employee/day.
  for(const id of ids)await lockTransaction(tx,`plan:${id}:${input.planDate}`);
  const owners=await tx.user.findMany({where:{id:{in:ids},isActive:true,AND:[assigneeScope(actor)]},select:{id:true,departmentId:true}});
  if(owners.length!==ids.length)throw new AccessError('An assignee is inactive or outside your permitted scope.');
  const created=[];
  for(const task of input.tasks){
   const owner=owners.find(o=>o.id===(task.assigneeId??actor.id))!;
   if(!owner.departmentId||owner.departmentId!==task.departmentId)throw new AccessError('The task department must match the employee’s assigned department.',400);
   if(await tx.dailyTask.findFirst({where:{userId:owner.id,planDate:new Date(input.planDate),taskTitle:{equals:task.taskTitle,mode:'insensitive'}}}))throw new AccessError(`This task already exists for that workday: ${task.taskTitle}`,409);
   const row=await tx.dailyTask.create({data:{userId:owner.id,departmentId:owner.departmentId,planDate:new Date(input.planDate),taskTitle:task.taskTitle,taskDescription:task.taskDescription||null,priority:task.priority,assignedBy:owner.id!==actor.id?actor.id:null},select:{id:true,userId:true,taskTitle:true,taskDescription:true,priority:true,planDate:true,assignedBy:true,departmentId:true,department:{select:{name:true}}}});
   if(owner.id!==actor.id)await audit(tx,actor.id,owner.id,'task.assigned',null,row);
   created.push(row);
  }
  return created;
 },{isolationLevel:'Serializable',timeout:15000});
 return NextResponse.json({message:'Task list saved successfully.',tasks});
}catch(e){return fail(e);}}
