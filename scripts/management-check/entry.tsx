import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ManagementDashboard} from '../../src/components/management/management-dashboard';
import {fixture} from './fixture';
import {TaskScreenshotMonitor} from '../../src/components/dashboard/task-screenshot-monitor';
const params=new URLSearchParams(location.search);
const empty=params.has('empty'),liveCount=params.has('five')?5:params.has('six')?6:null;
const data=empty?{...fixture,taskRows:[],employees:[],departments:[],live:[],kpis:{employees:0,present:0,tasks:0,completed:0,inProgress:0,pending:0,overdue:0}}:liveCount?{...fixture,live:fixture.live.slice(0,liveCount)}:fixture;
function Fixture(){
 const [expanded,setExpanded]=useState(false);
 return <><style>{'.fixture-shell{display:flex;min-height:100dvh}.fixture-sidebar{width:60px;flex-shrink:0;background:#031242}.fixture-scroll{display:flex;flex:1;min-width:0;flex-direction:column}.fixture-main{display:flex;flex:1;min-height:0;flex-direction:column;padding:16px}.fixture-topbar{height:40px;flex-shrink:0;background:#05165b;color:white;display:flex;align-items:center;justify-content:space-between;padding:0 12px}@media(min-width:768px){.fixture-shell{height:100dvh}.fixture-scroll{height:100dvh;overflow-y:auto}}@media(max-width:1099px){.fixture-sidebar{display:none}}'}</style>
 <div className="fixture-shell"><aside className="fixture-sidebar" style={{width:expanded?223:60}}/>
 <div className="dashboard-scroll fixture-scroll"><header className="fixture-topbar"><span>WorkLog Ultra</span><button onClick={()=>setExpanded(!expanded)} aria-label="Toggle fixture sidebar">{expanded?'Collapse':'Expand'}</button></header>
 <main className="fixture-main"><div className="dashboard-shell"><ManagementDashboard initial={data} filters={{from:fixture.from,to:fixture.to}}/></div><TaskScreenshotMonitor currentUserId="synthetic-user"/></main></div></div></>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
