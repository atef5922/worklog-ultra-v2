import Link from 'next/link';
import {Download,FileBarChart2,FileSpreadsheet} from 'lucide-react';
import {redirect} from 'next/navigation';
import {requireUser} from '@/lib/auth/server';
import {can,employeeScope} from '@/lib/auth/policy';
import {db} from '@/lib/db';
import {managementRecords} from '@/lib/management/records';
import {RecordsView} from '@/components/management/records-view';
import {ManagementReportFilters} from '@/components/management/management-report-filters';
import styles from './management-reports.module.css';

export default async function ReportsPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const actor=await requireUser();
 if(!can(actor,'reports.view'))redirect('/dashboard');
 const input=await searchParams;
 const params=new URLSearchParams(Object.entries(input).filter((entry):entry is [string,string]=>typeof entry[1]==='string'));
 let data;
 try{data=await managementRecords(actor,params,true);}catch(error){return <section className={styles.error}><h1>Report unavailable</h1><p>{error instanceof Error?error.message:'Unable to load report.'}</p><Link href="/management/reports">Reset report</Link></section>;}
 const filterPeople=await db.user.findMany({where:employeeScope(actor,'reports.view'),orderBy:[{name:'asc'},{id:'asc'}],select:{id:true,name:true,departmentId:true,department:{select:{id:true,name:true}}}});
 const departments=[...new Map(filterPeople.flatMap(person=>person.department?[person.department]:[]).map(department=>[department.id,department])).values()].sort((a,b)=>a.name.localeCompare(b.name));
 const exportQuery=new URLSearchParams(params);
 exportQuery.set('from',data.from);
 exportQuery.set('to',data.to);
 const selectedEmployee=filterPeople.find(person=>person.id===input.userId);
 const selectedDepartment=departments.find(department=>department.id===input.departmentId);
 const subject=selectedEmployee?.name??selectedDepartment?.name??'Management';

 return <div className={styles.page}>
  <header className={styles.header}>
   <div className={styles.heading}><span><FileBarChart2 size={22}/></span><div><h1>{subject} Report</h1><p>Authorized task and attendance summary for the selected date range.</p></div></div>
   {can(actor,'reports.export')&&<div className={styles.exports}>
    <Link href={`/api/management/reports/export?${exportQuery}&format=pdf`}><Download size={14}/>PDF</Link>
    <Link href={`/api/management/reports/export?${exportQuery}&format=xlsx`}><FileSpreadsheet size={14}/>Excel</Link>
   </div>}
  </header>
  <ManagementReportFilters key={[data.from,data.to,input.departmentId??'',input.userId??''].join(':')} from={data.from} to={data.to} departmentId={input.departmentId??''} userId={input.userId??''} departments={departments} employees={filterPeople.map(person=>({id:person.id,name:person.name,departmentId:person.departmentId}))}/>
  <RecordsView data={data} report/>
 </div>;
}
