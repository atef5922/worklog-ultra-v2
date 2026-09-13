import Link from 'next/link';
import {redirect} from 'next/navigation';
import {requireUser} from '@/lib/auth/server';
import {can,employeeScope,isSuperAdmin} from '@/lib/auth/policy';
import {db} from '@/lib/db';
import {formatDateTimeInDhaka} from '@/lib/utils';
export default async function AuditPage({searchParams}:{searchParams:Promise<{page?:string}>}){
 const actor=await requireUser();if(!can(actor,'audit_logs.view'))redirect('/dashboard');const search=await searchParams;const page=Math.max(1,Math.min(10000,Number(search.page)||1));
 const ids=isSuperAdmin(actor)?null:(await db.user.findMany({where:employeeScope(actor,'audit_logs.view'),select:{id:true}})).map(u=>u.id);
 const logs=await db.managementAuditLog.findMany({where:ids?{targetId:{in:ids}}:{},orderBy:[{createdAt:'desc'},{id:'desc'}],skip:(page-1)*50,take:51});
 return <div className="space-y-4"><h1 className="text-2xl font-semibold">Audit Log</h1><p className="text-sm text-[var(--muted-foreground)]">Read-only role, permission, task and attendance change records.</p>{logs.slice(0,50).map(l=><details key={l.id} className="rounded-lg border border-[var(--panel-border)] bg-[var(--panel)] p-4"><summary className="cursor-pointer text-sm font-medium">{l.action} · {formatDateTimeInDhaka(l.createdAt)}</summary><p className="mt-2 break-all text-xs">Actor: {l.actorId} · Target: {l.targetId??'Company'}<br/>Reason: {l.reason??'System migration'}</p><div className="mt-3 grid gap-3 md:grid-cols-2"><pre className="overflow-auto rounded bg-[var(--panel-alt)] p-3 text-xs">{JSON.stringify(l.beforeValue,null,2)}</pre><pre className="overflow-auto rounded bg-[var(--panel-alt)] p-3 text-xs">{JSON.stringify(l.afterValue,null,2)}</pre></div></details>)}<div className="flex gap-4 text-sm">{page>1&&<Link href={`?page=${page-1}`}>← Previous</Link>}{logs.length>50&&<Link href={`?page=${page+1}`}>Next →</Link>}</div></div>;
}
