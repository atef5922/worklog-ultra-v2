import {z} from 'zod';
import {db} from '@/lib/db';
import {APP_ROLES} from '@/lib/auth/roles';
import {authenticate,checkOrigin,fail,AccessError} from '@/lib/management/server';
import {PUT as saveAccess} from '@/app/api/management/access/route';
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){try{
 checkOrigin(request);await authenticate('super_admin');
 const input=z.object({role:z.enum(APP_ROLES),departmentId:z.string().uuid().nullable(),reason:z.string().trim().min(3).max(500).optional()}).safeParse(await request.json().catch(()=>null));
 if(!input.success)throw new AccessError('Select a valid role and department in Access Control.',400);
 const {id}=await params;if(!z.string().uuid().safeParse(id).success)throw new AccessError('Invalid employee ID.',400);
 const target=await db.user.findUnique({where:{id},select:{id:true,role:true,isActive:true,departmentId:true,teamId:true,managementEnabled:true,accessVersion:true,permissions:true,accessScopes:true}});
 if(!target)throw new AccessError('Employee not found.',404);
 const isEmployee=input.data.role==='employee';const scopeType=target.accessScopes[0]?.scopeType??'self';
 // Reuse the transaction, last-Super-Admin guard and audit of canonical Access Control.
 return saveAccess(new Request(new URL('/api/management/access',request.url),{method:'PUT',headers:request.headers,body:JSON.stringify({
  userId:id,role:input.data.role,isActive:target.isActive,departmentId:input.data.departmentId,
  teamId:input.data.departmentId===target.departmentId?target.teamId:null,
  managementEnabled:!isEmployee&&target.managementEnabled,version:target.accessVersion,
  permissions:isEmployee?[]:target.permissions.filter(p=>p.isGranted).map(p=>p.permissionKey),
  scopeType:isEmployee?'self':scopeType,scopeIds:isEmployee?[]:target.accessScopes.flatMap(s=>s.departmentId?[s.departmentId]:s.teamId?[s.teamId]:[]),
  reason:input.data.reason??'Role and department changed via account editor',
 })}));
}catch(error){return fail(error);}}
