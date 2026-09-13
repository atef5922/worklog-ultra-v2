import React from 'react';
import {createRoot} from 'react-dom/client';
import {ManagementDashboard} from '../../src/components/management/management-dashboard';
import {fixture} from './fixture';
const empty=new URLSearchParams(location.search).has('empty');
const data=empty?{...fixture,taskRows:[],employees:[],departments:[],live:[],kpis:{employees:0,present:0,tasks:0,completed:0,inProgress:0,pending:0,overdue:0}}:fixture;
createRoot(document.getElementById('root')!).render(<div style={{padding:16,maxWidth:'100%',minWidth:0}}><ManagementDashboard initial={data} filters={{from:fixture.from,to:fixture.to}}/></div>);
