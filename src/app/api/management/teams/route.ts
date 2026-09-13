import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { isSuperAdmin } from "@/lib/auth/policy";
import { authenticate, freshActor, checkOrigin, audit, fail, AccessError } from "@/lib/management/server";
const schema=z.object({id:z.string().uuid().optional(),name:z.string().trim().min(2).max(100),departmentId:z.string().uuid(),leadId:z.string().uuid().nullable(),memberIds:z.array(z.string().uuid()).max(500),reason:z.string().trim().min(3).max(500)});
export async function GET(){try{await authenticate("super_admin");return NextResponse.json({teams:await db.team.findMany({include:{members:{select:{id:true}},department:{select:{name:true}}},orderBy:{name:"asc"}})});}catch(e){return fail(e);}}
export async function POST(request: Request){try{
 checkOrigin(request);const actor=await authenticate("super_admin");const p=schema.safeParse(await request.json());if(!p.success)throw new AccessError("Provide a team, department, members and reason.",400);const input=p.data;
 const team=await db.$transaction(async tx=>{
  if(!isSuperAdmin(await freshActor(tx,actor.id)))throw new AccessError("Only Super Admin can manage teams.");
  if(!await tx.department.findUnique({where:{id:input.departmentId}}))throw new AccessError("Department not found.",400);
  if(input.leadId && !await tx.user.findFirst({where:{id:input.leadId,role:{in:['team_head','super_admin']},isActive:true}}))throw new AccessError("Select an active Team Head.",400);
  const members=[...new Set(input.memberIds)];
  if(await tx.user.count({where:{id:{in:members},departmentId:input.departmentId}})!==members.length)throw new AccessError("Members must belong to the selected department.",400);
  const before=input.id?await tx.team.findUnique({where:{id:input.id},include:{members:{select:{id:true}}}}):null;
  if(input.id&&!before)throw new AccessError("Team not found.",404);
  const data={name:input.name,departmentId:input.departmentId,leadId:input.leadId};
  const t=input.id?await tx.team.update({where:{id:input.id},data}):await tx.team.create({data});
  await tx.user.updateMany({where:{teamId:t.id,id:{notIn:members}},data:{teamId:null,accessVersion:{increment:1}}});
  await tx.user.updateMany({where:{id:{in:members}},data:{teamId:t.id,accessVersion:{increment:1}}});
  await audit(tx,actor.id,t.id,'team.saved',before,{...t,memberIds:members},input.reason);return t;
 },{isolationLevel:'Serializable'});return NextResponse.json({team,message:'Team saved.'});
}catch(e){return fail(e);}}
