import {authenticate,AccessError,fail} from '@/lib/management/server';
import {can} from '@/lib/auth/policy';
import {dashboardData} from '@/lib/management/dashboard-data';
import {exportResponse} from '@/lib/management/export';
export const runtime='nodejs';
export async function GET(request:Request){try{
 const actor=await authenticate('reports.export');if(!can(actor,'reports.view'))throw new AccessError('Report view access is required.');
 const params=new URL(request.url).searchParams;const format=params.get('format')??'xlsx';if(!['xlsx','pdf'].includes(format))throw new AccessError('Choose PDF or Excel.',400);
 const data=await dashboardData(actor,params);
 return exportResponse(`Management Dashboard | ${data.from} to ${data.to}`,[{name:'Tasks',columns:['Task','Employee','Department','Project','Client','Priority','Status','Deadline (UTC)','Checklist %','Estimate minutes','Saved task minutes'],rows:data.taskRows.map(t=>[t.title,t.employee,t.department,t.project,t.client,t.priority,t.status,t.deadline,t.progress,t.estimatedMinutes,t.trackedMinutes])},{name:'Employee summary',columns:['Employee','Department','Assigned','Completed','In progress','Pending','Overdue','Saved task minutes','Counted attendance minutes'],rows:data.employees.map(e=>[e.name,e.department,data.taskAccess?e.assigned:null,data.taskAccess?e.completed:null,data.taskAccess?e.inProgress:null,data.taskAccess?e.pending:null,data.taskAccess?e.overdue:null,data.taskAccess?e.trackedMinutes:null,data.attendanceAccess?e.countedMinutes:null])}],format,`worklog-dashboard-${data.from}-${data.to}`);
}catch(e){return fail(e);}}
