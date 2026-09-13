import Link from 'next/link';
import {redirect} from 'next/navigation';
import {requireUser} from '@/lib/auth/server';
import {can,canOpenManagement} from '@/lib/auth/policy';
import {dashboardData} from '@/lib/management/dashboard-data';
import {ManagementDashboard} from '@/components/management/management-dashboard';
export default async function ManagementPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const actor=await requireUser();if(!canOpenManagement(actor))redirect('/dashboard');const filters=await searchParams;
 if(!can(actor,'employees.view'))return <section><h1 className="text-2xl font-semibold">Management Dashboard</h1><p className="mt-3">Employee records access has not been granted.</p>{can(actor,'reports.view')&&<Link href="/management/reports">Open reports</Link>}</section>;
 const params=new URLSearchParams(Object.entries(filters).filter((p):p is [string,string]=>typeof p[1]==='string'));
 let data;try{data=await dashboardData(actor,params);}catch(e){return <section className="rounded-xl border border-[var(--panel-border)] bg-[var(--panel)] p-5"><h1 className="text-xl font-semibold">Management Dashboard</h1><p role="alert" className="my-3 text-rose-600">{e instanceof Error?e.message:'Dashboard unavailable.'}</p><Link href="/management">Reset filters</Link></section>;}
 return <ManagementDashboard key={params.toString()} initial={data} filters={filters}/>;
}
