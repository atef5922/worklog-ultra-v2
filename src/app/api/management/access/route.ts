import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { APP_ROLES } from "@/lib/auth/roles";
import { ATTENDANCE_DETAILS_PERMISSION, PERMISSIONS, SCOPE_TYPES, canChangeProtectedAccount, canReceiveAuditPermission, isSuperAdmin } from "@/lib/auth/policy";
import { actorInclude, authenticate, freshActor, fail, checkDashboardActionOrigin, AccessError, audit } from "@/lib/management/server";

const schema=z.object({userId:z.string().uuid(),role:z.enum(APP_ROLES),isActive:z.boolean(),managementEnabled:z.boolean(),
  departmentId:z.string().uuid().nullable(),teamId:z.string().uuid().nullable(),version:z.number().int().nonnegative(),
  permissions:z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length),scopeType:z.enum(SCOPE_TYPES),scopeIds:z.array(z.string().uuid()).max(200),reason:z.string().trim().min(3).max(500)});
export async function GET(request: Request) {
 try {
  await authenticate("super_admin");
  const search=new URL(request.url).searchParams.get("q")?.slice(0,100) ?? "";
  const [users,departments,teams]=await Promise.all([
   db.user.findMany({where:search?{OR:[{name:{contains:search,mode:"insensitive"}},{email:{contains:search,mode:"insensitive"}}]}:{},
    orderBy:[{name:"asc"},{id:"asc"}],take:200,
    select:{id:true,name:true,email:true,role:true,isActive:true,departmentId:true,teamId:true,managementEnabled:true,accessVersion:true,permissions:true,accessScopes:{include:{employee:{select:{id:true,name:true}}}}}}),
   db.department.findMany({orderBy:{name:"asc"},select:{id:true,name:true}}),
   db.team.findMany({orderBy:{name:"asc"},select:{id:true,name:true,departmentId:true,leadId:true}}),
  ]);
  return NextResponse.json({users,departments,teams});
 } catch(error){return fail(error);}
}
export async function PUT(request: Request) {
 try {
  checkDashboardActionOrigin(request); const actor=await authenticate("super_admin");
  const parsed=schema.safeParse(await request.json());
  if(!parsed.success) throw new AccessError(parsed.error.issues[0]?.message ?? "Invalid access settings",400);
  const input=parsed.data;
  if(input.role==='employee' && (input.managementEnabled || input.permissions.length)) throw new AccessError("Employee accounts cannot receive management permissions.",400);
  if(input.permissions.includes("audit_logs.view") && !canReceiveAuditPermission(input.role)) {
   throw new AccessError("Audit Log access is limited to Super Admin, Moderator and Admin / HR.",400);
  }
  const result=await db.$transaction(async tx=>{
   // Lock the entire authority set in a consistent order. Two admins cannot demote the last admins concurrently.
   await tx.$queryRaw`SELECT id::text FROM users WHERE role::text='super_admin' ORDER BY id FOR UPDATE`;
   const currentActor=await freshActor(tx,actor.id);
   if(!isSuperAdmin(currentActor)) throw new AccessError("Only Super Admin can change access.");
   const target=await tx.user.findUnique({where:{id:input.userId},include:actorInclude});
   if(!target) throw new AccessError("User not found.",404);
   if(target.accessVersion!==input.version) throw new AccessError("Access was changed by another administrator. Refresh first.",409);
   const count=await tx.user.count({where:{role:"super_admin",isActive:true}});
   if(!canChangeProtectedAccount(currentActor,target,input.role,input.isActive,count)) throw new AccessError("Keep at least one active Super Admin. You cannot remove your own Super Admin access.",409);
   if(input.departmentId && !await tx.department.findUnique({where:{id:input.departmentId}})) throw new AccessError("Department not found.",400);
   if(input.teamId){const team=await tx.team.findUnique({where:{id:input.teamId}});if(!team || team.departmentId!==input.departmentId)throw new AccessError("Team must belong to the selected department.",400);}
   if(['departments','teams','employees'].includes(input.scopeType)){
    const ids=[...new Set(input.scopeIds)];
    const count=input.scopeType==='departments'?await tx.department.count({where:{id:{in:ids}}}):input.scopeType==='teams'?await tx.team.count({where:{id:{in:ids}}}):await tx.user.count({where:{id:{in:ids},isActive:true}});
    if(!ids.length || count!==ids.length) throw new AccessError("Select valid departments, teams or active employees for this scope.",400);
   }
   if(target.ledTeams.length && input.role!=='team_head' && input.role!=='super_admin') {
     await tx.team.updateMany({where:{leadId:target.id},data:{leadId:null}});
   }
   // Replacing current settings is explicit; the immutable before/after audit retains their history.
   await tx.userPermission.deleteMany({where:{userId:target.id}});
   await tx.userAccessScope.deleteMany({where:{userId:target.id}});
   const scopes=input.role==='employee'?[]:['departments','teams','employees'].includes(input.scopeType)
    ? [...new Set(input.scopeIds)].map(id=>({scopeType:input.scopeType,departmentId:input.scopeType==='departments'?id:null,teamId:input.scopeType==='teams'?id:null,employeeId:input.scopeType==='employees'?id:null,grantedBy:actor.id}))
    : [{scopeType:input.scopeType,departmentId:null,teamId:null,employeeId:null,grantedBy:actor.id}];
   const updated=await tx.user.update({where:{id:target.id},data:{role:input.role,isActive:input.isActive,departmentId:input.departmentId,teamId:input.teamId,
    managementEnabled:input.role==='super_admin'||input.managementEnabled,accessVersion:{increment:1},
    permissions:{create:[...new Set(input.permissions)].map(permissionKey=>({permissionKey,isGranted:true,grantedBy:actor.id}))},accessScopes:{create:scopes}},
    select:{id:true,role:true,isActive:true,managementEnabled:true,accessVersion:true,departmentId:true,teamId:true,permissions:true,accessScopes:true}});
   await audit(tx,actor.id,target.id,"access.updated",{role:target.role,isActive:target.isActive,managementEnabled:target.managementEnabled,permissions:target.permissions,scopes:target.accessScopes,departmentId:target.departmentId,teamId:target.teamId},updated,input.reason);
   if(!input.isActive) await tx.userSession.updateMany({where:{userId:target.id,revokedAt:null},data:{revokedAt:new Date()}});
   return updated;
  },{isolationLevel:"Serializable"});
  return NextResponse.json({message:"Role and access saved.",user:result});
 }catch(error){return fail(error);}
}
