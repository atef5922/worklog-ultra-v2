import {NextResponse} from 'next/server';
import {getServerAuthContext} from '@/lib/auth/server';
import {db} from '@/lib/db';
import {AccessError,checkDashboardActionOrigin,fail,freshActor} from '@/lib/management/server';
export async function POST(request:Request){try{
 checkDashboardActionOrigin(request);const {user}=await getServerAuthContext();if(!user)throw new AccessError('Please sign in.',401);
 const body=await request.json().catch(()=>({}));const action=body.action??'heartbeat';
 if(!['heartbeat','meeting_start','meeting_end'].includes(action))throw new AccessError('Invalid presence action.',400);
 const presence=await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM users WHERE id=${user.id}::uuid FOR UPDATE`;
  await freshActor(tx,user.id);const now=new Date();
  {
   const attendance=await tx.attendanceRecord.findFirst({where:{userId:user.id,workSessions:{some:{endedAt:null}}},orderBy:{attendanceDate:'desc'},include:{workSessions:{where:{endedAt:null}},breakSessions:{where:{endedAt:null}}}});
   if(action==='meeting_start'&&(!attendance?.workSessions.length||attendance.breakSessions.length))throw new AccessError('Check in and end your break before starting a meeting.',409);
  const current=await tx.employeePresence.findUnique({where:{userId:user.id}});
  const activeSession=attendance?.workSessions[0];
  const validMeeting=current?.meetingStartedAt&&activeSession&&!attendance?.breakSessions.length&&current.meetingStartedAt>=activeSession.startedAt?current.meetingStartedAt:null;
  const meetingStartedAt=action==='meeting_start'?(validMeeting??now):action==='meeting_end'?null:validMeeting;
  const saved=await tx.employeePresence.upsert({where:{userId:user.id},create:{userId:user.id,lastSeenAt:now,meetingStartedAt:meetingStartedAt??null},update:{lastSeenAt:now,...(meetingStartedAt!==undefined?{meetingStartedAt}:{})}});
  return {lastSeenAt:saved.lastSeenAt,meetingStartedAt:saved.meetingStartedAt};
  }
 });
 return NextResponse.json({presence});
}catch(e){return fail(e);}}
