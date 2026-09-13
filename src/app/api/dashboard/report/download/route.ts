import {getServerAuthContext} from '@/lib/auth/server';
import {db} from '@/lib/db';
import {dateRange,recordMetrics} from '@/lib/management/records';
import {exportResponse} from '@/lib/management/export';
import {fail,AccessError} from '@/lib/management/server';
import {buildReportSummary} from '@/lib/report-summary';
import {getHistoryData} from '@/lib/worklog';
export const runtime='nodejs';
export async function GET(request:Request){try{
 const {user}=await getServerAuthContext();if(!user)throw new AccessError('Please sign in.',401);
 const params=new URL(request.url).searchParams,{from,to}=dateRange(params);
 const [tasks,attendance]=await Promise.all([getHistoryData(user.id,from,to),db.attendanceRecord.findMany({where:{userId:user.id,attendanceDate:{gte:new Date(from),lte:new Date(to)}},include:{workSessions:true,breakSessions:true},orderBy:{attendanceDate:'asc'}})]);
 return exportResponse(`${user.name} | ${from} to ${to}`,[{name:'Tasks',columns:['Task','Date','Description','Status','Priority','Tracked minutes','Completion note'],rows:buildReportSummary(tasks).items.map(t=>[t.title,t.date,t.description,t.status,t.priority,t.trackedMinutes,t.note])},{name:'Attendance',columns:['Date','Actual minutes','Counted minutes','Break minutes','Included break','Extra break','Outside minutes','Overtime minutes'],rows:attendance.map(r=>{const m=recordMetrics(r);return [r.attendanceDate.toISOString().slice(0,10),m.activeMinutes,m.workingMinutes,m.breakMinutes,m.includedBreakMinutes,m.excessBreakMinutes,m.outsideMinutes,m.overtimeMinutes];})}],params.get('format')??'xlsx',`worklog-personal-${from}-${to}`);
}catch(e){return fail(e);}}
