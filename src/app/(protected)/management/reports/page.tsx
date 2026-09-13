import Link from 'next/link';
import {redirect} from 'next/navigation';
import {requireUser} from '@/lib/auth/server';
import {can} from '@/lib/auth/policy';
import {managementRecords} from '@/lib/management/records';
import {RecordsView} from '@/components/management/records-view';
export default async function ReportsPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const actor=await requireUser();if(!can(actor,'reports.view'))redirect('/dashboard');const input=await searchParams;const params=new URLSearchParams(Object.entries(input).filter((e):e is [string,string]=>typeof e[1]==='string'));let data;try{data=await managementRecords(actor,params,true);}catch(e){return <p>{e instanceof Error?e.message:'Unable to load report.'}</p>;}
 const exportQuery=new URLSearchParams(params);exportQuery.set('from',data.from);exportQuery.set('to',data.to);
 return <div className="space-y-4"><h1 className="text-2xl font-semibold">Management Reports</h1><p className="text-sm text-[var(--muted-foreground)]">Date-range summaries for authorized employee records. Task time can overlap; attendance is calculated separately.</p><form className="flex flex-wrap gap-3 text-sm"><label>From <input type="date" name="from" defaultValue={data.from} className="rounded border bg-[var(--panel)] p-2"/></label><label>To <input type="date" name="to" defaultValue={data.to} className="rounded border bg-[var(--panel)] p-2"/></label>{['userId','departmentId','teamId','role','q'].map(key=>input[key]?<input hidden readOnly name={key} value={input[key]} key={key}/>:null)}<button className="rounded bg-indigo-600 px-4 text-white">View report</button></form>{can(actor,'reports.export')&&<div className="flex gap-3">{['pdf','xlsx'].map(format=><Link className="rounded-lg border border-[var(--panel-border)] px-4 py-2 text-sm text-indigo-500" key={format} href={`/api/management/reports/export?${exportQuery}&format=${format}`}>Download {format==='pdf'?'PDF':'Excel'}</Link>)}</div>}<RecordsView data={data} report/></div>;
}
