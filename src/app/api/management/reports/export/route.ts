import {authenticate,fail,AccessError} from '@/lib/management/server';
import {can,employeeScope} from '@/lib/auth/policy';
import {managementRecords} from '@/lib/management/records';
import {exportResponse} from '@/lib/management/export';
import {db} from '@/lib/db';
import {roleUiTitle} from '@/lib/auth/roles';
export const runtime='nodejs';
export async function GET(request:Request){try{
 const actor=await authenticate('reports.export');if(!can(actor,'reports.view'))throw new AccessError('Report view permission is also required.');
 const params=new URL(request.url).searchParams;const data=await managementRecords(actor,params,true);
 // Intersect view and export scopes, never broaden the result with query parameters.
 const allowed=new Set((await db.user.findMany({where:employeeScope(actor,'reports.export'),select:{id:true}})).map(u=>u.id));
 const rows=data.rows.filter(r=>allowed.has(r.id));
 return exportResponse(`Management report | ${data.from} to ${data.to}`,[{name:'Employee Summary',columns:['Employee','Employee ID','Role','Department','Team','Attendance','Planned','Completed','In progress','Pending','Task minutes','Actual minutes','Counted minutes','Break minutes','Outside minutes','Overtime minutes'],rows:rows.map(r=>[r.name,r.id,roleUiTitle(r.role),r.department?.name??'',r.team?.name??'',r.state,r.planned,r.completed,r.inProgress,r.pending,r.tracked,r.actual,r.counted,r.break,r.outside,r.overtime])}],params.get('format')??'xlsx',`worklog-management-${data.from}-${data.to}`);
}catch(e){return fail(e);}}
