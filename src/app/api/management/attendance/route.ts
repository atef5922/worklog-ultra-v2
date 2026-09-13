import {NextResponse} from 'next/server';
import {z} from 'zod';
import {db} from '@/lib/db';
import {employeeScope} from '@/lib/auth/policy';
import {authenticate,freshActor,checkOrigin,audit,fail,AccessError} from '@/lib/management/server';
import {validateAttendanceCorrection} from '@/lib/management/attendance-validation';
import {calculateSegmentedAttendanceMetrics} from '@/lib/attendance-policy';
import {toDateOnly} from '@/lib/utils';
const interval=z.object({id:z.string().uuid().optional(),startedAt:z.string().datetime({offset:true}),endedAt:z.string().datetime({offset:true})});
const schema=z.object({recordId:z.string().uuid(),updatedAt:z.string().datetime({offset:true}),reason:z.string().trim().min(10).max(1000),workSessions:z.array(interval).min(1).max(50),breakSessions:z.array(interval).max(50),legacyBreakMinutes:z.number().int().nonnegative().max(1440)});
export async function PUT(request:Request){try{
 checkOrigin(request);const actor=await authenticate('attendance.correct');const p=schema.safeParse(await request.json());if(!p.success)throw new AccessError(p.error.issues[0]?.message??'Invalid correction.',400);const input=p.data;
 const result=await db.$transaction(async tx=>{
  const fresh=await freshActor(tx,actor.id);
  await tx.$queryRaw`SELECT id::text FROM attendance_records WHERE id=${input.recordId}::uuid FOR UPDATE`;
  const record=await tx.attendanceRecord.findFirst({where:{id:input.recordId,user:employeeScope(fresh,'attendance.correct')},include:{workSessions:true,breakSessions:true}});
  if(!record)throw new AccessError('Attendance correction is outside your access.');
  if(record.userId===actor.id&&actor.role!=='super_admin')throw new AccessError('Your own attendance requires another authorized reviewer.');
  if(record.updatedAt.toISOString()!==input.updatedAt)throw new AccessError('Attendance changed. Refresh before correcting.',409);
  if(record.workSessions.some(s=>!s.endedAt)||record.breakSessions.some(s=>!s.endedAt))throw new AccessError('Check out before correcting this day.',409);
  const error=validateAttendanceCorrection(toDateOnly(record.attendanceDate),input.workSessions,input.breakSessions,input.legacyBreakMinutes);if(error)throw new AccessError(error,400);
  // Existing sessions retain IDs. Corrections cannot silently remove old evidence.
  for(const [old,next] of [[record.workSessions,input.workSessions],[record.breakSessions,input.breakSessions]] as const){
   const ids=next.flatMap(s=>s.id?[s.id]:[]);
   if(new Set(ids).size!==ids.length||old.some(s=>!ids.includes(s.id))||ids.some(id=>!old.some(s=>s.id===id)))throw new AccessError('Retain all existing session IDs; add sessions separately.',400);
  }
  for(const s of input.workSessions){const data={startedAt:new Date(s.startedAt),endedAt:new Date(s.endedAt),endReason:'corrected'};if(s.id)await tx.attendanceWorkSession.update({where:{id:s.id},data});else await tx.attendanceWorkSession.create({data:{...data,attendanceRecordId:record.id}});}
  for(const s of input.breakSessions){const data={startedAt:new Date(s.startedAt),endedAt:new Date(s.endedAt),endReason:'corrected'};if(s.id)await tx.attendanceBreakSession.update({where:{id:s.id},data});else await tx.attendanceBreakSession.create({data:{...data,attendanceRecordId:record.id}});}
  const metrics=calculateSegmentedAttendanceMetrics({attendanceDate:toDateOnly(record.attendanceDate),...input});
  const sessions=[...input.workSessions].sort((a,b)=>new Date(a.startedAt).getTime()-new Date(b.startedAt).getTime());
  const updated=await tx.attendanceRecord.update({where:{id:record.id},data:{checkInAt:new Date(sessions[0].startedAt),checkOutAt:new Date(sessions.at(-1)!.endedAt),breakMinutes:metrics.breakMinutes,workingMinutes:metrics.workingMinutes,legacyBreakMinutes:input.legacyBreakMinutes},include:{workSessions:true,breakSessions:true}});
  await audit(tx,actor.id,record.userId,'attendance.corrected',record,updated,input.reason);return updated;
 },{isolationLevel:'Serializable'});return NextResponse.json({message:'Attendance corrected; the original values are preserved in the audit log.',record:result});
}catch(e){return fail(e);}}
