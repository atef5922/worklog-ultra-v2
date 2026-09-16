import {z} from 'zod';
import {NextResponse} from 'next/server';
import {Prisma} from '@prisma/client';
import {db} from '@/lib/db';
import {employeeScope,isSuperAdmin} from '@/lib/auth/policy';
import {authenticate,checkOrigin,freshActor,audit,fail,AccessError} from '@/lib/management/server';
const schema=z.object({name:z.string().trim().min(2).max(120),email:z.string().trim().email().max(254).transform(value=>value.toLowerCase()).optional(),designation:z.string().trim().max(120),phone:z.string().trim().max(40),location:z.string().trim().max(200),updatedAt:z.string().datetime({offset:true}),reason:z.string().trim().min(10).max(1000)});
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){try{
 const actor=await authenticate('employees.update');checkOrigin(request);const {id}=await params;
 const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success||!z.string().uuid().safeParse(id).success)throw new AccessError('Enter valid employee details and a reason of at least 10 characters.',400);
 await db.$transaction(async tx=>{
  const current=await freshActor(tx,actor.id);await tx.$queryRaw`SELECT id FROM users WHERE id=${id}::uuid FOR UPDATE`;
  const target=await tx.user.findFirst({where:{AND:[{id},employeeScope(current,'employees.update')]},select:{id:true,role:true,name:true,email:true,designation:true,phone:true,location:true,updatedAt:true}});
  if(!target)throw new AccessError('Employee not found in your scope.',404);
  if(target.role==='super_admin'&&!isSuperAdmin(current))throw new AccessError('Only Super Admin can change a Super Admin profile.');
  if(target.updatedAt.toISOString()!==parsed.data.updatedAt)throw new AccessError('Employee details changed. Refresh and try again.',409);
  const {name,email,designation,phone,location,reason}=parsed.data;
  const emailChanged=email!==undefined&&email!==target.email;
  if(emailChanged){
   const existing=await tx.user.findFirst({where:{id:{not:id},email:{equals:email,mode:'insensitive'}},select:{id:true}});
   if(existing)throw new AccessError('This email address is already in use.',409);
  }
  const updated=await tx.user.update({where:{id},data:{name,email:emailChanged?email:undefined,designation:designation||null,phone:phone||null,location:location||null},select:{id:true,name:true,email:true,designation:true,phone:true,location:true}});
  if(emailChanged)await tx.userSession.updateMany({where:{userId:id,revokedAt:null},data:{revokedAt:new Date()}});
  await audit(tx,current.id,id,'employee.profile_updated',target,updated,reason);
 },{isolationLevel:'Serializable'});
 return NextResponse.json({message:'Employee profile updated.'});
}catch(e){
 if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==='P2002')return NextResponse.json({message:'This email address is already in use.'},{status:409});
 return fail(e);
}}
