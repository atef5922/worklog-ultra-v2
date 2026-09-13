import 'server-only';
import {db} from '@/lib/db';
import {can,employeeScope,isSuperAdmin,canChangeProtectedAccount} from '@/lib/auth/policy';
import {AccessError,audit,freshActor,type Actor} from './server';

export async function changeAccountStatus(actor:Actor,id:string,isActive:boolean,reason:string){
  return db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id::text FROM users WHERE role::text='super_admin' ORDER BY id FOR UPDATE`;
    const current=await freshActor(tx,actor.id);
    if(!can(current,'employees.status.manage'))throw new AccessError('Account status permission is required.');
    const target=await tx.user.findFirst({where:{AND:[{id},employeeScope(current,'employees.status.manage')]},select:{id:true,name:true,role:true,isActive:true,accessVersion:true}});
    if(!target)throw new AccessError('Employee not found in your scope.',404);
    if(target.id===current.id)throw new AccessError('You cannot change your own account status.',409);
    if(target.role==='super_admin'){
      const count=await tx.user.count({where:{role:'super_admin',isActive:true}});
      if(!isSuperAdmin(current)||!canChangeProtectedAccount(current,target,target.role,isActive,count))throw new AccessError('Keep at least one active Super Admin.',409);
    }
    if(target.isActive===isActive)return target;
    const updated=await tx.user.update({where:{id},data:{isActive,accessVersion:{increment:1}},select:{id:true,name:true,role:true,isActive:true,accessVersion:true}});
    if(!isActive)await tx.userSession.updateMany({where:{userId:id,revokedAt:null},data:{revokedAt:new Date()}});
    await audit(tx,current.id,id,'employee.status.updated',{isActive:target.isActive},{isActive},reason);
    return updated;
  },{isolationLevel:'Serializable'});
}
