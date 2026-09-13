import 'server-only';
import {NextResponse} from 'next/server';
import {z} from 'zod';
import {db} from '@/lib/db';
import {can,departmentScope,isSuperAdmin} from '@/lib/auth/policy';
import {authenticate,checkOrigin,freshActor,audit,fail,AccessError} from './server';
export async function createDepartment(request:Request){try{
 const actor=await authenticate('departments.manage');checkOrigin(request);
 const input=z.object({name:z.string().trim().min(2).max(100)}).safeParse(await request.json().catch(()=>null));
 if(!input.success)throw new AccessError('Enter a department name of 2–100 characters.',400);
 const department=await db.$transaction(async tx=>{
  const current=await freshActor(tx,actor.id);
  if(!can(current,'departments.manage')||!(isSuperAdmin(current)||current.accessScopes.some(s=>s.scopeType==='all_company')))throw new AccessError('Company-wide department management is required to create a department.');
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('department-names'))`;
  if(await tx.department.findFirst({where:{name:{equals:input.data.name,mode:'insensitive'}}}))throw new AccessError('This department already exists.',409);
  const created=await tx.department.create({data:input.data});await audit(tx,current.id,null,'department.created',null,created);return created;
 },{isolationLevel:'Serializable'});
 return NextResponse.json({message:'Department added successfully.',department});
}catch(e){return fail(e);}}
export async function deleteDepartment(request:Request){try{
 const actor=await authenticate('departments.manage');checkOrigin(request);
 const input=z.object({id:z.string().uuid()}).safeParse(await request.json().catch(()=>null));
 if(!input.success)throw new AccessError('Invalid department.',400);
 await db.$transaction(async tx=>{
  const current=await freshActor(tx,actor.id);
  const department=await tx.department.findFirst({where:{AND:[{id:input.data.id},departmentScope(current,'departments.manage')]},include:{_count:{select:{users:true,tasks:true,notices:true,signups:true,teams:true,accessScopes:true,screenshots:true}}}});
  if(!department)throw new AccessError('Department not found in your scope.',404);
  if(Object.values(department._count).some(n=>n>0))throw new AccessError('This department has linked records and cannot be deleted.',409);
  await tx.department.delete({where:{id:department.id}});await audit(tx,current.id,null,'department.deleted',department,null);
 },{isolationLevel:'Serializable'});
 return NextResponse.json({message:'Empty department deleted successfully.'});
}catch(e){return fail(e);}}
