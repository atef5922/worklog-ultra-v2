import Link from 'next/link';
import {
  ArrowLeft,
  BadgeCheck,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileClock,
  FileText,
  Mail,
  MapPin,
  PauseCircle,
  Phone,
  Timer,
  UserRound,
} from 'lucide-react';
import {notFound,redirect} from 'next/navigation';
import {EmployeeProfileEditor} from '@/components/management/employee-profile-editor';
import {AssignTask,TaskManagementActions,AttendanceCorrection} from '@/components/management/employee-actions';
import {requireUser} from '@/lib/auth/server';
import {can,canOpenManagement} from '@/lib/auth/policy';
import {employeeDetails} from '@/lib/management/records';
import {roleUiTitle} from '@/lib/auth/roles';
import {formatMinutes,formatDateTimeInDhaka,toDateOnly} from '@/lib/utils';
import {attendanceRevision} from '@/lib/attendance-record';
import styles from './employee-details.module.css';

const statusLabel=(status:string)=>status==='done'?'Completed':status==='in_progress'?'In progress':'Pending';
const initials=(name:string)=>name.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]?.toUpperCase()).join('');
const shortDate=(date:Date)=>new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Dhaka',day:'2-digit',month:'short',year:'numeric'}).format(date);
const rangeMinutes=(updates:{reportDate:Date;trackedMinutes:number}[],from:string)=>
 updates.filter(update=>toDateOnly(update.reportDate)>=from).reduce((total,update)=>total+update.trackedMinutes,0);

function EmptyState({title,description}:{title:string;description:string}){
 return <div className={styles.empty}><ClipboardList size={22}/><strong>{title}</strong><p>{description}</p></div>;
}

export default async function EmployeeDetailsPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|undefined>>}){
 const actor=await requireUser();
 if(!canOpenManagement(actor))redirect('/dashboard');
 const {id}=await params;
 const search=await searchParams;
 const query=new URLSearchParams(Object.entries(search).filter((entry):entry is [string,string]=>typeof entry[1]==='string'));
 let data;
 try{data=await employeeDetails(actor,id,query);}catch{notFound();}

 const employee=data.employee;
 const availableTabs=[
  ['overview','Overview'],
  ...(data.taskAccess?[['tasks','Tasks']]:[]),
  ...(data.attendanceAccess?[['attendance','Attendance']]:[]),
  ...(data.historyAccess?[['history','History']]:[]),
  ...(can(actor,'reports.view')?[['reports','Reports']]:[]),
 ] as string[][];
 const requestedTab=search.tab??'overview';
 const tab=availableTabs.some(([key])=>key===requestedTab)?requestedTab:'overview';
 const range=`from=${data.from}&to=${data.to}`;
 const completed=data.taskAccess?data.tasks.filter(task=>task.updates[0]?.status==='done').length:0;
 const inProgress=data.taskAccess?data.tasks.filter(task=>task.updates[0]?.status==='in_progress').length:0;
 const pending=data.taskAccess?data.tasks.filter(task=>(task.updates[0]?.status??'pending')==='pending').length:0;
 const completionRate=data.tasks.length?Math.round(completed/data.tasks.length*100):0;
 const taskMinutes=data.taskAccess?data.tasks.reduce((total,task)=>total+rangeMinutes(task.updates,data.from),0):0;
 const countedMinutes=data.attendanceAccess?data.attendance.reduce((total,record)=>total+record.metrics.workingMinutes,0):0;

 return <div className={styles.page} data-fit-viewport={tab==='overview'?true:undefined}>
  <header className={styles.profileHeader}>
   <div className={styles.identityBlock}>
    <Link href="/management" className={styles.backLink}><ArrowLeft size={14}/>Management dashboard</Link>
    <div className={styles.identity}>
     <span className={styles.avatar} aria-hidden>{initials(employee.name)}</span>
     <div>
      <div className={styles.nameLine}><h1>{employee.name}</h1><span className={employee.isActive?styles.activeBadge:styles.inactiveBadge}><i/>{employee.isActive?'Active':'Inactive'}</span></div>
      <p>{employee.designation??roleUiTitle(employee.role)}</p>
     </div>
    </div>
   </div>
   <dl className={styles.headerFacts}>
    <div><dt><UserRound size={13}/>Role</dt><dd>{roleUiTitle(employee.role)}</dd></div>
    <div><dt><BriefcaseBusiness size={13}/>Department</dt><dd>{employee.department?.name??'Not assigned'}</dd></div>
    <div><dt><BadgeCheck size={13}/>Team</dt><dd>{employee.team?.name??'Not assigned'}</dd></div>
   </dl>
  </header>

  <section className={styles.controlBar} aria-label="Employee record controls">
   <nav className={styles.tabs} aria-label="Employee record sections">
    {availableTabs.map(([key,label])=><Link key={key} aria-current={tab===key?'page':undefined} className={tab===key?styles.activeTab:styles.tab} href={`?${range}&tab=${key}`}>{label}</Link>)}
   </nav>
   <form className={styles.dateFilter}>
    <input name="tab" value={tab} hidden readOnly/>
    <label>From<input type="date" name="from" defaultValue={data.from}/></label>
    <label>To<input type="date" name="to" defaultValue={data.to}/></label>
    <button><CalendarDays size={14}/>Apply dates</button>
   </form>
  </section>

   {tab==='overview'&&<div className={styles.overview}>
   <div className={styles.stats}>
    {data.taskAccess&&<>
     <article><span className={styles.statIconBlue}><ClipboardList size={18}/></span><div><small>Tasks in period</small><strong>{data.tasks.length}</strong><p>{inProgress} in progress · {pending} pending</p></div></article>
     <article><span className={styles.statIconGreen}><CheckCircle2 size={18}/></span><div><small>Completed</small><strong>{completed}</strong><p>{completionRate}% completion rate</p></div></article>
     <article><span className={styles.statIconPurple}><Timer size={18}/></span><div><small>Task time</small><strong>{formatMinutes(taskMinutes)}</strong><p>Selected date range</p></div></article>
    </>}
    {data.attendanceAccess&&<article><span className={styles.statIconOrange}><Clock3 size={18}/></span><div><small>Counted work</small><strong>{formatMinutes(countedMinutes)}</strong><p>{data.attendance.length} attendance record{data.attendance.length===1?'':'s'}</p></div></article>}
   </div>
    <section className={`${styles.panel} ${styles.overviewPanel}`}>
    <div className={styles.panelHeader}><div><h2>Employee information</h2><p>Employment and contact information for this account.</p></div></div>
    <dl className={styles.infoGrid}>
     <div><dt><Mail size={14}/>Email address</dt><dd>{employee.email}</dd></div>
     <div><dt><BriefcaseBusiness size={14}/>Designation</dt><dd>{employee.designation??'Not provided'}</dd></div>
     <div><dt><Phone size={14}/>Phone</dt><dd>{employee.phone??'Not provided'}</dd></div>
     <div><dt><MapPin size={14}/>Location</dt><dd>{employee.location??'Not provided'}</dd></div>
     <div><dt><UserRound size={14}/>Employee ID</dt><dd className={styles.employeeId}>{employee.id}</dd></div>
     <div><dt><CalendarDays size={14}/>Account created</dt><dd>{shortDate(employee.createdAt)}</dd></div>
    </dl>
    {can(actor,'employees.update')&&<EmployeeProfileEditor key={employee.updatedAt.toISOString()} employee={{id:employee.id,name:employee.name,designation:employee.designation,phone:employee.phone,location:employee.location,updatedAt:employee.updatedAt.toISOString()}}/>}
   </section>
   </div>}

  {tab==='tasks'&&data.taskAccess&&<section className={styles.panel}>
   <div className={styles.panelHeader}><div><h2>Tasks in selected period</h2><p>Task progress, tracked time and available management actions.</p></div><span className={styles.countBadge}>{data.tasks.length} tasks</span></div>
   {can(actor,'tasks.assign')&&<div className={styles.assignWrap}><AssignTask userId={id} departmentId={employee.departmentId}/></div>}
   <div className={styles.tableWrap}>
    <table className={styles.taskTable}>
     <thead><tr><th>Task</th><th>Status</th><th>Priority</th><th>Task time</th><th>Updated</th><th>Action</th></tr></thead>
     <tbody>{data.tasks.map(task=>{const status=task.updates[0]?.status??'pending';return <tr key={task.id}>
      <td><Link href={`/dashboard/tasks/${task.id}`} className={styles.primaryLink}>{task.taskTitle}</Link><small title={task.taskDescription??undefined}>{task.taskDescription||'No description provided'}</small></td>
      <td><span className={styles[status==='done'?'statusDone':status==='in_progress'?'statusProgress':'statusPending']}><i/>{statusLabel(status)}</span></td>
      <td><span className={styles.priority} data-priority={task.priority}>{task.priority}</span></td>
      <td className={styles.tabular}>{formatMinutes(rangeMinutes(task.updates,data.from))}</td>
      <td><time className={styles.updated}>{shortDate(task.updatedAt)}</time></td>
      <td><div className={styles.actions}><Link href={`/dashboard/tasks/${task.id}`} className={styles.secondaryLink}>Details</Link><TaskManagementActions task={{id:task.id,taskTitle:task.taskTitle,taskDescription:task.taskDescription,priority:task.priority,updatedAt:task.updatedAt.toISOString(),completed:status==='done'}} canEdit={can(actor,'tasks.update')} canReopen={can(actor,'tasks.reopen')}/></div></td>
     </tr>;})}</tbody>
    </table>
    {!data.tasks.length&&<EmptyState title="No tasks found" description="No task records match the selected date range."/>}
   </div>
   <p className={styles.footnote}>Showing up to 500 tasks. Use a narrower date range for older records.</p>
  </section>}

  {tab==='attendance'&&data.attendanceAccess&&<div className={styles.recordList}>
   {data.attendance.map(record=>{const hasRunning=record.workSessions.some(session=>!session.endedAt);return <section key={record.id} className={styles.panel}>
    <div className={styles.panelHeader}><div><h2>{shortDate(record.attendanceDate)}</h2><p>Attendance sessions and calculated work time.</p></div><span className={hasRunning?styles.runningBadge:styles.closedBadge}><i/>{hasRunning?'Working now':'Day closed'}</span></div>
    <div className={styles.metricGrid}>
     {[['Actual work',record.metrics.activeMinutes],['Counted work',record.metrics.workingMinutes],['Break',record.metrics.breakMinutes],['Outside',record.metrics.outsideMinutes],['Overtime',record.metrics.overtimeMinutes]].map(([label,value])=><div key={String(label)}><small>{label}</small><strong>{formatMinutes(value as number)}</strong></div>)}
    </div>
    <div className={styles.sessions}>
     {([['Office sessions',record.workSessions,BriefcaseBusiness],['Break sessions',record.breakSessions,PauseCircle]] as const).map(([label,items,Icon])=><section key={label}><h3><Icon size={15}/>{label}<span>{items.length}</span></h3><div>{items.map((session,index)=><p key={session.id}><b>{String(index+1).padStart(2,'0')}</b><time>{formatDateTimeInDhaka(session.startedAt)}</time><span>to</span>{session.endedAt?<time>{formatDateTimeInDhaka(session.endedAt)}</time>:<em>Running</em>}<small>{session.endReason??(session.endedAt?'Recorded':'Open session')}</small></p>)}{!items.length&&<p className={styles.noSession}>No sessions recorded.</p>}</div></section>)}
    </div>
    {can(actor,'attendance.correct')&&<div className={styles.correctionWrap}><AttendanceCorrection record={{id:record.id,revision:attendanceRevision(record),updatedAt:record.updatedAt.toISOString(),legacyBreakMinutes:record.legacyBreakMinutes,workSessions:record.workSessions.map(session=>({id:session.id,startedAt:session.startedAt.toISOString(),endedAt:session.endedAt?.toISOString()??null})),breakSessions:record.breakSessions.map(session=>({id:session.id,startedAt:session.startedAt.toISOString(),endedAt:session.endedAt?.toISOString()??null}))}}/></div>}
   </section>;})}
   {!data.attendance.length&&<section className={styles.panel}><EmptyState title="No attendance found" description="No attendance records match the selected date range."/></section>}
  </div>}

  {tab==='history'&&data.historyAccess&&<section className={styles.panel}>
   <div className={styles.panelHeader}><div><h2>Permanent work history</h2><p>Read-only completion and reopen history. These records cannot be edited here.</p></div><span className={styles.countBadge}>{data.history.length} records</span></div>
   <div className={styles.historyList}>{data.history.map(task=>{const status=task.updates[0]?.status??'pending';return <article key={task.id}>
    <span className={styles.historyIcon}><FileClock size={16}/></span>
    <div><Link href={`/dashboard/tasks/${task.id}`}>{task.taskTitle}</Link><p>{task.activityEvents.length} lifecycle event{task.activityEvents.length===1?'':'s'} · Current status: {statusLabel(status)}</p></div>
    <Link href={`/dashboard/tasks/${task.id}`} className={styles.secondaryLink}>View details</Link>
   </article>;})}</div>
   {!data.history.length&&<EmptyState title="No history found" description="No completion or reopen events match the selected date range."/>}
  </section>}

  {tab==='reports'&&can(actor,'reports.view')&&<section className={styles.reportCard}>
   <span className={styles.reportIcon}><FileText size={24}/></span>
   <div><h2>Employee performance report</h2><p>Open the consolidated task and attendance report for {employee.name} within the selected date range.</p></div>
   <Link href={`/management/reports?${range}&userId=${id}`}>Open report<FileText size={15}/></Link>
  </section>}
 </div>;
}
