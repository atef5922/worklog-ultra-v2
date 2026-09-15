import Link from 'next/link';
import {BriefcaseBusiness,CheckCircle2,Clock3,Coffee,Timer,UsersRound} from 'lucide-react';
import {roleUiTitle} from '@/lib/auth/roles';
import {formatMinutes,formatDateTimeInDhaka} from '@/lib/utils';
import type {managementRecords} from '@/lib/management/records';
import styles from './records-view.module.css';

const stateClass=(state:string|null)=>state==='Working'?styles.working:state==='On break'?styles.break:state==='Checked out'?styles.out:styles.neutral;

export function RecordsView({data,report=false,canExport=false}:{data:Awaited<ReturnType<typeof managementRecords>>;report?:boolean;canExport?:boolean}){
 const sum=(key:'completed'|'tracked'|'counted'|'overtime')=>data.rows.reduce((total,row)=>total+(row[key]??0),0);
 const totals=[
  {label:'People in scope',value:data.rows.length,description:'Authorized records',icon:UsersRound,tone:'blue'},
  ...(data.attendanceAllowed?[
   {label:'Working now',value:data.rows.filter(row=>row.state==='Working').length,description:'Currently checked in',icon:BriefcaseBusiness,tone:'green'},
   {label:'On break',value:data.rows.filter(row=>row.state==='On break').length,description:'Active break sessions',icon:Coffee,tone:'orange'},
   {label:'Counted work',value:formatMinutes(sum('counted')),description:'Selected date range',icon:Clock3,tone:'purple'},
   {label:'Overtime',value:formatMinutes(sum('overtime')),description:'Beyond duty window',icon:Timer,tone:'red'},
  ]:[]),
  ...(data.tasksAllowed?[
   {label:'Completed tasks',value:sum('completed'),description:'Marked as done',icon:CheckCircle2,tone:'green'},
   {label:'Task time',value:formatMinutes(sum('tracked')),description:'Independent task timers',icon:Timer,tone:'blue'},
  ]:[]),
 ];
 const query=`from=${data.from}&to=${data.to}`;

 return <div className={styles.view}>
  <div className={styles.totals}>{totals.map(item=>{const Icon=item.icon;return <article key={item.label}><span className={styles[item.tone]}><Icon size={18}/></span><div><small>{item.label}</small><strong>{item.value}</strong><p>{item.description}</p></div></article>;})}</div>
  {report&&canExport&&<div className={styles.legacyExports}><Link href={`/api/management/reports/export?${query}&format=xlsx`}>Download Excel</Link><Link href={`/api/management/reports/export?${query}&format=pdf`}>Download PDF</Link></div>}
  <section className={styles.panel}>
   <header><div><h2>Employee records <span>{data.rows.length}</span></h2><p>Detailed task and attendance values for every employee in scope.</p></div></header>
   <div className={styles.tableWrap}>
    <table>
     <thead><tr>{['Employee','Role / Team',...(data.attendanceAllowed?['Attendance','In / Out','Active / Counted','Break / Outside','Overtime']:[]),...(data.tasksAllowed?['Tasks','Task time']:[]),'Action'].map(heading=><th key={heading}>{heading}</th>)}</tr></thead>
     <tbody>{data.rows.map(row=><tr key={row.id}>
      <td><Link className={styles.employeeName} href={`/management/employees/${row.id}?${query}`}>{row.name}</Link><small className={styles.id}>{row.id.slice(0,8)}</small></td>
      <td>{roleUiTitle(row.role)}<small>{row.department?.name??'No department'} · {row.team?.name??'No team'}</small></td>
      {data.attendanceAllowed&&<>
       <td><span className={`${styles.state} ${stateClass(row.state)}`}><i/>{row.state}</span></td>
       <td className={styles.dateCell}>{row.firstIn?<time>{formatDateTimeInDhaka(row.firstIn)}</time>:'—'}<small>{row.lastOut?formatDateTimeInDhaka(row.lastOut):'No check-out'}</small></td>
       <td className={styles.tabular}>{formatMinutes(row.actual??0)} <span>/</span> {formatMinutes(row.counted??0)}</td>
       <td className={styles.tabular}>{formatMinutes(row.break??0)} <span>/</span> {formatMinutes(row.outside??0)}</td>
       <td className={styles.tabular}>{formatMinutes(row.overtime??0)}</td>
      </>}
      {data.tasksAllowed&&<>
       <td className={styles.taskCell}><strong>{row.completed}/{row.planned} done</strong><small>{row.pending} pending · {row.inProgress} in progress</small></td>
       <td className={styles.tabular}>{formatMinutes(row.tracked??0)}</td>
      </>}
      <td><Link className={styles.details} href={`/management/employees/${row.id}?${query}`}>View details</Link></td>
     </tr>)}</tbody>
    </table>
    {!data.rows.length&&<div className={styles.empty}><UsersRound size={22}/><strong>No employee records</strong><p>No employees match this access scope and filter.</p></div>}
   </div>
  </section>
  {!report&&<section className={styles.panel}><header><div><h2>Attention required</h2><p>Attendance observations only; these are not absence or payroll decisions.</p></div></header><div className={styles.attention}>{data.rows.filter(row=>row.flags.length).slice(0,30).map(row=><Link key={row.id} href={`/management/employees/${row.id}?${query}`}><strong>{row.name}</strong><span>{row.flags.join(' · ')}</span></Link>)}</div></section>}
 </div>;
}
