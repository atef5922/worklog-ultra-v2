'use client';
import { formatDateTimeInDhaka } from "@/lib/utils";
import { formatDateInDhaka } from "@/lib/utils";
import { DateInput } from "@/components/ui/date-input";
import {useEffect,useMemo,useRef,useState} from 'react';
import Link from 'next/link';
import {Users,UserCheck,ClipboardList,CheckCircle2,LoaderCircle,Clock3,TriangleAlert,RotateCcw,Download,CalendarDays,Radio,Building2,ChartColumnIncreasing} from 'lucide-react';
import type {ManagementDashboardData} from '@/lib/management/dashboard-data';
import {taskTimeUsage} from '@/lib/management/task-insights';
import {toDateOnly} from '@/lib/utils';
import styles from './management-dashboard.module.css';
const minutes=(n:number)=>`${Math.floor(n/60)}h ${String(n%60).padStart(2,'0')}m`;
const compactMinutes=(n:number)=>`${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;
const statusLabel=(s:string)=>s==='done'?'Completed':s==='in_progress'?'In progress':'Pending';
const dateTime=(s:string|null)=>s?formatDateTimeInDhaka(s):'—';
const initials=(name:string)=>name.split(' ').slice(0,2).map(s=>s[0]).join('');
function TaskTime({tracked,estimated}:{tracked:number;estimated:number|null}){
 const usage=taskTimeUsage(tracked,estimated),over=usage.overMinutes>0;
 const display=usage.estimatedMinutes===null?compactMinutes(usage.trackedMinutes):`${compactMinutes(usage.trackedMinutes)} / ${compactMinutes(usage.estimatedMinutes)}`;
 const title=usage.estimatedMinutes===null?`Tracked: ${minutes(usage.trackedMinutes)} - Estimated time not set`:`Tracked: ${minutes(usage.trackedMinutes)} - Estimated: ${minutes(usage.estimatedMinutes)} - ${over?`${minutes(usage.overMinutes)} over estimate`:`${usage.usagePercent}% of estimate used`}`;
 return <span className={`${styles.timeUsage} ${over?styles.overEstimate:''}`} data-task-time data-over-estimate={over||undefined} title={title} aria-label={title}><span className={styles.timeValue}>{display}</span>{over&&<TriangleAlert size={11} aria-hidden/>}</span>;
}
function Meter({value}:{value:number|null}){return <div className={styles.meterRow}><div className={styles.meter}><span style={{width:`${value??0}%`}}/></div><span>{value===null?'—':`${value}%`}</span></div>;}
type DashboardFilters={userId:string;departmentId:string;from:string;to:string;taskStatus:string;priority:string;q:string;attendancePeriod:string};
const filterQuery=(values:Record<string,string|undefined>)=>new URLSearchParams(Object.entries(values).filter((entry):entry is [string,string]=>typeof entry[1]==='string'&&entry[1]!=='')).toString();

function CompactDate({value,inline=false}:{value:string|null;inline?:boolean}){
 if(!value)return <>—</>;
 const date=new Date(value);
 const shortParts=inline?new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Dhaka',day:'numeric',month:'short'}).formatToParts(date):null;
 const day=shortParts?shortParts.find(part=>part.type==='day')!.value+' '+shortParts.find(part=>part.type==='month')!.value:formatDateInDhaka(date);
 const time=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Dhaka',hour:'2-digit',minute:'2-digit',hour12:true}).format(date);
 return <time dateTime={value} title={dateTime(value)} className={inline?styles.inlineDate:undefined}>{day}{inline?<><span className={styles.muted}> / </span><span>{time}</span></>:<small>{time}</small>}</time>;
}

export function ManagementDashboard({initial,filters}:{initial:ManagementDashboardData;filters:Record<string,string|undefined>}){
 const [data,setData]=useState(initial),[error,setError]=useState(''),[sort,setSort]=useState('latest');
 const taskRowsRef=useRef<HTMLDivElement>(null),peopleRowsRef=useRef<HTMLDivElement>(null),departmentRowsRef=useRef<HTMLDivElement>(null),liveRowsRef=useRef<HTMLDivElement>(null);
 const [liveScrollbarVisible,setLiveScrollbarVisible]=useState(false);

 const liveMembers=useMemo(()=>[...data.live].sort((a,b)=>Number(a.state==='Not checked in')-Number(b.state==='Not checked in')||a.name.localeCompare(b.name)),[data.live]);
 const liveAvailable=liveMembers.filter(person=>person.state==='Available').length;
 const liveTaskRunning=liveMembers.filter(person=>person.state==='Task running').length;
 const liveInMeeting=liveMembers.filter(person=>person.state==='In meeting').length;
 useEffect(()=>{
  const area=liveRowsRef.current,table=area?.querySelector('table');
  if(!area||!table)return;
  const measure=()=>{
   const visible=table.getBoundingClientRect().height-area.clientHeight>8;
   setLiveScrollbarVisible(previous=>previous===visible?previous:visible);
  };
  const observer=new ResizeObserver(measure);
  observer.observe(area);observer.observe(table);measure();
  return()=>observer.disconnect();
 },[]);

 const [selection,setSelection]=useState(()=>({values:{userId:filters.userId??'',departmentId:filters.departmentId??'',from:initial.from,to:initial.to,taskStatus:filters.taskStatus??'',priority:filters.priority??'',q:filters.q??'',attendancePeriod:filters.attendancePeriod??'today'},query:filterQuery({...filters,from:initial.from,to:initial.to}),revision:0,delay:0}));
 const [appliedQuery,setAppliedQuery]=useState(()=>filterQuery({...filters,from:initial.from,to:initial.to})),[loading,setLoading]=useState(false);
 const activeRequest=useRef<AbortController|null>(null);
 const values=selection.values;
 const dateError=!values.from||!values.to?'Choose both From and To dates.':values.from>values.to?'From date must not be after To date.':'';
 function updateFilters(next:DashboardFilters,delay=0){
  activeRequest.current?.abort();
  setError('');setLoading(Boolean(next.from&&next.to&&next.from<=next.to));
  setSelection(previous=>({values:next,query:filterQuery(next),revision:previous.revision+1,delay}));
 }
 useEffect(()=>{
  if(dateError)return;
  const controller=new AbortController();activeRequest.current=controller;
  let pending=false,waiting=selection.revision>0,applyPending=selection.revision>0;
  const refresh=async()=>{
   if(pending||controller.signal.aborted)return;
   pending=true;setLoading(true);
   try{
    const response=await fetch(`/api/management/dashboard?${selection.query}`,{cache:'no-store',signal:controller.signal});
    const next=await response.json();
    if(controller.signal.aborted)return;
    if(!response.ok){
     if(response.status===401||response.status===403){window.location.reload();return;}
     throw new Error(next.message??'Dashboard refresh failed.');
    }
    setData(next);setAppliedQuery(selection.query);setError('');
    if(applyPending){
     applyPending=false;
     for(const ref of [taskRowsRef,peopleRowsRef,departmentRowsRef,liveRowsRef])ref.current?.scrollTo({top:0,left:0,behavior:'instant'});
     window.history.replaceState(null,'',`/management${selection.query?'?'+selection.query:''}`);
    }
   }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Unable to refresh.');}
   finally{pending=false;if(!controller.signal.aborted)setLoading(false);}
  };
  const timeout=waiting?window.setTimeout(()=>{waiting=false;void refresh();},selection.delay):undefined;
  const backgroundRefresh=()=>{if(!document.hidden&&!waiting)void refresh();};
  const interval=window.setInterval(backgroundRefresh,20000);
  window.addEventListener('focus',backgroundRefresh);
  return()=>{controller.abort();window.clearTimeout(timeout);window.clearInterval(interval);window.removeEventListener('focus',backgroundRefresh);};
 },[selection,dateError]);
 const rows=useMemo(()=>[...data.taskRows].sort((a,b)=>sort==='deadline'?(a.deadline??'9999').localeCompare(b.deadline??'9999'):sort==='employee'?a.employee.localeCompare(b.employee):b.lastUpdate.localeCompare(a.lastUpdate)),[data.taskRows,sort]);
 const exportQuery=new URLSearchParams(appliedQuery);exportQuery.delete('format');
 const kpis=[{label:'Total employees',value:data.kpis.employees,sub:'Within your access scope',icon:Users,tone:'blue'},
 {label:'Present in period',value:data.attendanceAccess?data.kpis.present:null,sub:data.attendanceAccess?`${data.kpis.employees?Math.round(data.kpis.present/data.kpis.employees*100):0}% checked in`:'Access not granted',icon:UserCheck,tone:'green'},
 {label:'Tasks in period',value:data.taskAccess?data.kpis.tasks:null,sub:'Includes unfinished carry-forward',icon:ClipboardList,tone:'purple'},
 {label:'Completed',value:data.taskAccess?data.kpis.completed:null,sub:`${data.kpis.tasks?Math.round(data.kpis.completed/data.kpis.tasks*100):0}% completion`,icon:CheckCircle2,tone:'green'},
 {label:'In progress',value:data.taskAccess?data.kpis.inProgress:null,sub:'Running or paused work',icon:LoaderCircle,tone:'blue'},
 {label:'Pending',value:data.taskAccess?data.kpis.pending:null,sub:'Not started',icon:Clock3,tone:'orange'},
 {label:'Overdue',value:data.taskAccess?data.kpis.overdue:null,sub:'Unfinished past deadline',icon:TriangleAlert,tone:'red'}];
 const summary=data.attendance.summary;
 const attendanceRate=summary.total?Math.round(summary.present/summary.total*100):0;
 const onTimeStop=summary.total?(summary.present-summary.late)/summary.total*100:0;
 const presentStop=summary.total?summary.present/summary.total*100:0;
 const summaryPercent=(count:number)=>summary.total?`${(count/summary.total*100).toFixed(1)}%`:'0.0%';
 const attentionFilter=exportQuery.get('attention');
 return <div className={styles.dashboard} data-management-dashboard><header className={styles.heading}>
 <h1 style={{fontSize:18,lineHeight:'24px'}}>Management Dashboard</h1><div className={styles.headingMeta}><p><CalendarDays size={12}/><time>{data.from===data.to?data.from:`${data.from} — ${data.to}`}</time><span>Employee work, progress and attendance</span></p>
 <div className={styles.sync} role="status">{dateError||error?<span className={styles.error}>{dateError||error} · Showing last successful data</span>:loading?<>Updating filters…</>:<>Updated {new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Dhaka',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(data.generatedAt))} · refreshes every 20s</>}</div></div></header>
 <form className={styles.filters} aria-label="Dashboard filters" onSubmit={event=>{event.preventDefault();updateFilters(values);}}>
  <label>Employee<select name="userId" aria-label="Employee" value={values.userId} onChange={event=>updateFilters({...values,userId:event.target.value})}><option value="">All employees</option>{data.options.employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
  <label>Department<select name="departmentId" aria-label="Department" value={values.departmentId} onChange={event=>updateFilters({...values,departmentId:event.target.value})}><option value="">All departments</option>{data.options.departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
  <label>From<DateInput name="from" aria-label="From" value={values.from} onValueChange={value=>updateFilters({...values,from:value})} required/></label>
  <label>To<DateInput name="to" aria-label="To" value={values.to} onValueChange={value=>updateFilters({...values,to:value})} required/></label>
  <label>Status<select name="taskStatus" aria-label="Status" value={values.taskStatus} onChange={event=>updateFilters({...values,taskStatus:event.target.value})}><option value="">All status</option><option value="pending">Pending</option><option value="in_progress">In progress</option><option value="done">Completed</option></select></label>
  <label>Priority<select name="priority" aria-label="Priority" value={values.priority} onChange={event=>updateFilters({...values,priority:event.target.value})}><option value="">All priority</option><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option></select></label>
  <label className={styles.search}>Search<input name="q" aria-label="Search" placeholder="Task, employee, project…" value={values.q} onChange={event=>updateFilters({...values,q:event.target.value},350)} maxLength={100}/></label>
  <button type="button" className={styles.secondary} onClick={()=>{const today=toDateOnly();updateFilters({userId:'',departmentId:'',from:today,to:today,taskStatus:'',priority:'',q:'',attendancePeriod:'today'});}}><RotateCcw size={13}/>Reset</button>
 </form>
 {attentionFilter&&<p className={styles.filterNote}>Showing {attentionFilter} tasks. <Link href={`/management?${new URLSearchParams([...exportQuery].filter(([key])=>key!=='attention'))}`}>Clear attention filter</Link></p>}
 <div className={styles.kpis}>{kpis.map(k=><section className={styles.kpi} data-tone={k.tone} key={k.label} title={`${k.label}: ${k.value??'—'} · ${k.value===null?'Access not granted':k.sub}`}><div className={`${styles.icon} ${styles[k.tone]}`}><k.icon size={20}/></div><div className={styles.kpiContent}><div className={styles.kpiHeadline}><strong>{k.value??'—'}</strong><h2>{k.label}</h2></div><p>{k.value===null?'Access not granted':k.sub}</p></div></section>)}</div>
 <div className={styles.layout}><div className={styles.main}><section className={`${styles.panel} ${styles.taskPanel}`} aria-label="Tasks in selected period"><div className={styles.panelHeading}><div><h2><ClipboardList size={17}/>Tasks in selected period <span className={styles.recordCount}>{rows.length}</span></h2><p title="All tasks within your scope. Task time is independent of attendance.">Scope-filtered tasks · independent task time</p></div><div className={styles.actions}><select aria-label="Sort tasks" value={sort} onChange={e=>{setSort(e.target.value);taskRowsRef.current?.scrollTo({top:0,behavior:'instant'});}}><option value="latest">Latest update</option><option value="deadline">Deadline</option><option value="employee">Employee</option></select>{data.canExport&&<details className={styles.export}><summary><Download size={13}/>Export</summary><div><a href={`/api/management/dashboard/export?${exportQuery}&format=xlsx`}>Excel (.xlsx)</a><a href={`/api/management/dashboard/export?${exportQuery}&format=pdf`}>PDF</a></div></details>}</div></div>
 <div className={`${styles.tableWrap} ${styles.scrollTable} ${styles.hoverScrollbar}`} ref={taskRowsRef} data-scroll-table tabIndex={0} role="region" aria-label="Task table"><table className={styles.tasks}><colgroup>{[3,21,14,16,8,8,10,12,8].map((width,index)=><col key={index} style={{width:'var(--task-col-'+(index+1)+','+width+'%)'}}/>)}</colgroup>
 <thead><tr>{['SL','Task','Assigned to','Status / Priority','Deadline','Progress','Time (T/E)','Updated','Action'].map(h=><th key={h} title={h==='Time (T/E)'?'Tracked / Estimated time':undefined}>{h}</th>)}</tr></thead>
 <tbody>{rows.map((t,i)=><tr key={t.id}>
  <td>{i+1}</td>
  <td><Link href={'/dashboard/tasks/'+t.id} title={t.title+'\n'+t.description} className={styles.taskTitle}>{t.title}</Link></td>
  <td><Link className={styles.person} href={'/management/employees/'+t.userId} title={t.employee}><span className={styles.avatar}>{initials(t.employee)}</span><span>{t.employee}</span></Link></td>
  <td data-task-status title={statusLabel(t.status)+' / '+t.priority+(t.deadlineState==='overdue'?' · Overdue':'')}><span className={styles.statusPriority}><span className={styles[t.status==='done'?'greenText':t.status==='in_progress'?'blueText':'orangeText']}>{statusLabel(t.status)}</span><span className={styles.muted}> / </span><span className={styles.priority} data-priority={t.priority}>{t.priority}</span></span></td>
  <td className={t.deadlineState==='overdue'?styles.error:''}><CompactDate value={t.deadline}/></td>
  <td title={t.checklistTotal?t.checklistDone+'/'+t.checklistTotal+' items'+(t.progress===100&&t.status!=='done'?' · Awaiting Done':''):undefined}>{t.progress===null?'—':<Meter value={t.progress}/>} {!!t.checklistTotal&&<small>{t.checklistDone}/{t.checklistTotal} items</small>}</td>
  <td className={`${styles.mono} ${styles.timeCell}`}><TaskTime tracked={t.totalTrackedMinutes} estimated={t.estimatedMinutes}/></td>
  <td data-task-updated><CompactDate value={t.lastUpdate} inline/></td>
  <td><div className={styles.rowActions}><Link className={styles.textLink} href={'/dashboard/tasks/'+t.id}>Details</Link>{t.canPlan&&t.status!=='done'&&<Link className={styles.textLink} href={'/dashboard/tasks/'+t.id+'/planning'}>Plan</Link>}</div></td>
 </tr>)}</tbody></table>{!rows.length&&<p className={styles.empty}>{data.taskAccess?'No tasks match these filters.':'Task view access has not been granted.'}</p>}</div>
 </section>
 <div className={styles.summaries}>
 <section className={styles.panel} aria-label="Employee summary"><div className={styles.panelHeading}><h2><Users size={14}/>Employee summary</h2><span className={styles.recordCount}>{data.employees.length} employees</span></div>
 <div className={`${styles.tableWrap} ${styles.scrollTable} ${styles.hoverScrollbar}`} ref={peopleRowsRef} data-scroll-table tabIndex={0} role="region" aria-label="Employee summary table"><table className={styles.employeeTable}><colgroup>{[33,16,12,19,20].map((width,index)=><col key={index} style={{width:width+'%'}}/>)}</colgroup><thead><tr>{['Employee','Tasks','Done','Time','Rate'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{data.employees.map(e=><tr key={e.id}><td><Link href={'/management/employees/'+e.id} title={e.name}>{e.name}</Link><small title={e.department}>{e.department}</small></td><td>{data.taskAccess?e.assigned:'—'}<small title="Pending tasks">{data.taskAccess?e.pending:'—'} pending</small></td><td>{data.taskAccess?e.completed:'—'}</td><td title="Saved task time">{data.taskAccess?minutes(e.trackedMinutes):'—'}</td><td><Meter value={data.taskAccess?e.completionRate:null}/></td></tr>)}</tbody></table>{!data.employees.length&&<p className={styles.empty}>No employees in this scope.</p>}</div></section>
 <section className={styles.panel} aria-label="Department summary"><div className={styles.panelHeading}><h2><Building2 size={14}/>Departments</h2><span className={styles.recordCount}>{data.departments.length} departments</span></div>
 <div className={`${styles.tableWrap} ${styles.scrollTable}`} ref={departmentRowsRef} data-scroll-table tabIndex={0} role="region" aria-label="Department summary table"><table className={styles.departmentTable}><colgroup>{[31,18,13,20,18].map((width,index)=><col key={index} style={{width:width+'%'}}/>)}</colgroup><thead><tr>{['Department','People','Done','Pending','Rate'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{data.departments.map(d=><tr key={d.id}><td title={d.name}>{d.name}</td><td>{d.employees}</td><td>{data.taskAccess?d.completed:'—'}</td><td>{data.taskAccess?d.pending:'—'}</td><td><Meter value={data.taskAccess?d.completionRate:null}/></td></tr>)}</tbody></table>{!data.departments.length&&<p className={styles.empty}>No departments in this scope.</p>}</div></section>
 <section className={styles.panel}><div className={styles.panelHeading}><h2><ChartColumnIncreasing size={16}/>Weekly task status</h2></div><div className={styles.legend}><span><i className={styles.greenDot}/>Completed</span><span><i className={styles.blueDot}/>In progress</span><span><i className={styles.orangeDot}/>Pending</span></div>{data.taskAccess?<div className={styles.chart} role="img" aria-label={`Task status for the seven days ending ${formatDateInDhaka(data.to)}`}>{data.week.map(w=>{const max=Math.max(1,...data.week.map(d=>d.completed+d.inProgress+d.pending));return <div className={styles.chartColumn} key={w.date} title={`${formatDateInDhaka(w.date)}: ${w.completed} completed, ${w.inProgress} in progress, ${w.pending} pending`}><div className={styles.bar}><span style={{height:`${w.pending/max*100}%`,background:'#f6ab47'}}/><span style={{height:`${w.inProgress/max*100}%`,background:'#468bf2'}}/><span style={{height:`${w.completed/max*100}%`,background:'#31bd82'}}/></div><small title={formatDateInDhaka(w.date)}>{w.date.slice(8)}</small></div>;})}</div>:<p className={styles.empty}>Task view access not granted.</p>}<p className={styles.chartNote} title="Scope-filtered daily task states; status and priority filters apply to the main table.">Daily states · seven-day trend</p></section></div></div>
 <aside className={styles.right}><section id="live-team" className={[styles.panel,styles.livePanel].join(" ")}><div className={styles.panelHeading}><h2><span className={styles.liveIcon} aria-hidden="true"><Radio size={15}/></span>Live team status</h2></div><div className={styles.liveKpis} aria-label="Today's team status"><div className={styles.liveKpi} data-kind="available" title="Checked in, with no running task, break, or meeting"><span>Available</span><strong>{data.attendanceAccess?liveAvailable:'—'}</strong></div><div className={styles.liveKpi} data-kind="task-running"><span>Task running</span><strong>{data.attendanceAccess?liveTaskRunning:'—'}</strong></div><div className={styles.liveKpi} data-kind="in-meeting"><span>In meeting</span><strong>{data.attendanceAccess?liveInMeeting:'—'}</strong></div></div><div className={styles.liveList} ref={liveRowsRef} data-live-scroll data-scrollbar={liveScrollbarVisible} role="region" aria-label="Live team employees" tabIndex={0}><table className={styles.liveTable}><colgroup><col style={{width:'64%'}}/><col style={{width:'36%'}}/></colgroup><thead><tr><th scope="col">Employee</th><th scope="col">Status</th></tr></thead><tbody>{liveMembers.map(p=><tr key={p.id}><td><Link className={styles.liveEmployee} href={'/management/employees/'+p.id} title={[p.name,p.state,...p.tasks].join('\n')}><span className={styles.liveIdentity}><span className={styles.liveName}>{p.name}</span><small className={styles.connection} title={p.lastSeenAt?'Last seen '+dateTime(p.lastSeenAt):'No recent activity'}>{p.connected?'Connected':p.lastSeenAt?'Last seen '+dateTime(p.lastSeenAt):'No recent activity'}</small></span></Link></td><td><span className={styles.state} data-state={p.state}><i aria-hidden="true"/>{p.state}</span></td></tr>)}</tbody></table></div>{!data.live.length&&<p className={styles.empty}>{data.attendanceAccess?'No employees in this scope.':'Attendance view access not granted.'}</p>}</section>
 <section id="attendance-summary" className={styles.panel}><div className={styles.panelHeading}><h2><CalendarDays size={17}/>Attendance summary</h2><select className={styles.attendancePeriodSelect} aria-label="Attendance summary period" value={values.attendancePeriod} onChange={event=>updateFilters({...values,attendancePeriod:event.target.value})}><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="last7">Last 7 days</option></select></div>{data.attendanceAccess?<div className={styles.attendanceSummaryBody}><div className={styles.attendanceDonut} style={{background:summary.total?`conic-gradient(#20ad78 0 ${onTimeStop}%, #f1a23b ${onTimeStop}% ${presentStop}%, #ed6774 ${presentStop}% 100%)`:'#e7edf6'}} role="img" aria-label={`Attendance rate ${attendanceRate}%. Present ${summary.present}, absent ${summary.absent}, late ${summary.late} (included in present).`}><div><strong>{attendanceRate}%</strong><span>Attendance rate</span></div></div><dl className={styles.attendanceLegend}><div><dt><i className={styles.attendancePresentDot}/>Present</dt><dd>{summary.present} <span>({summaryPercent(summary.present)})</span></dd></div><div><dt title="Scheduled workday with no check-in yet"><i className={styles.attendanceAbsentDot}/>Absent</dt><dd>{summary.absent} <span>({summaryPercent(summary.absent)})</span></dd></div><div><dt title="Included in Present; first check-in after 10:00 AM"><i className={styles.attendanceLateDot}/>Late</dt><dd>{summary.late} <span>({summaryPercent(summary.late)})</span></dd></div></dl></div>:<p className={styles.empty}>Attendance view access not granted.</p>}</section></aside></div>
 </div>;
}
