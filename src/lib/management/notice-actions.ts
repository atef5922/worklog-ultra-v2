import 'server-only';
import {z} from 'zod';
import {apiSuccess} from '@/lib/api';
import {db} from '@/lib/db';
import {can,departmentScope,isSuperAdmin} from '@/lib/auth/policy';
import {authenticate,checkOrigin,freshActor,audit,fail,AccessError} from './server';
export async function publishNotice(request:Request){try{
 const actor=await authenticate('notices.publish');checkOrigin(request);
 const input=z.object({title:z.string().trim().min(1).max(200),body:z.string().trim().min(1).max(20000),targetDepartmentId:z.string().uuid().nullish()}).safeParse(await request.json().catch(()=>null));
 if(!input.success)throw new AccessError('Enter a valid title, notice and target department.',400);
 const notice=await db.$transaction(async tx=>{
  const current=await freshActor(tx,actor.id);if(!can(current,'notices.publish'))throw new AccessError('Notice publishing has not been granted.');
  const target=input.data.targetDepartmentId;
  if(target){if(!await tx.department.findFirst({where:{AND:[{id:target},departmentScope(current,'notices.publish')]}}))throw new AccessError('Department outside your scope.');}
  else if(!isSuperAdmin(current)&&!current.accessScopes.some(s=>s.scopeType==='all_company'))throw new AccessError('A company-wide notice requires company-wide access.');
  const created=await tx.hrNotice.create({data:{...input.data,authorId:current.id,isActive:true,publishedAt:new Date()},include:{targetDepartment:true}});await audit(tx,current.id,null,'notice.published',null,created);return created;
 },{isolationLevel:'Serializable'});
 return apiSuccess({message:'Notice published successfully.',notice:{id:notice.id,title:notice.title,body:notice.body,departmentName:notice.targetDepartment?.name??'All Departments'}});
}catch(e){return fail(e);}}
