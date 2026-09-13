// Read-only schema/query smoke test. Does not create sessions or log in as a user.
import {db} from '../../src/lib/db';
import {actorInclude} from '../../src/lib/management/server';
import {dashboardData} from '../../src/lib/management/dashboard-data';
import {managementRecords,employeeDetails} from '../../src/lib/management/records';
async function main(){
 const actor=await db.user.findFirst({where:{isActive:true,role:'super_admin'},include:actorInclude});
 if(!actor)throw new Error('An active Super Admin is required to validate the management query shape.');
 const [dashboard,report,details]=await Promise.all([dashboardData(actor,new URLSearchParams()),managementRecords(actor,new URLSearchParams(),true),employeeDetails(actor,actor.id,new URLSearchParams())]);
 if(dashboard.kpis.tasks!==dashboard.taskRows.length)throw new Error('Dashboard aggregate mismatch.');
 if(dashboard.kpis.completed!==dashboard.taskRows.filter(t=>t.status==='done').length)throw new Error('Completion count mismatch.');
 console.log('PASS: real PostgreSQL read-only management dashboard, report and employee-detail queries.',JSON.stringify({employees:dashboard.kpis.employees,tasks:dashboard.kpis.tasks,reportRows:report.rows.length,detailTabs:!!details.employee}));
 const denied={...actor,role:'admin',managementEnabled:false};
 let rejected=false;try{await dashboardData(denied,new URLSearchParams());}catch{rejected=true;}
 if(!rejected)throw new Error('Disabled management gate was accepted.');
 console.log('PASS: disabled gate rejected by the same data service.');
}
main().then(async()=>{await db.$disconnect();process.exit(0);}).catch(async e=>{console.error('Data smoke failed:',e.code??'',e.message);await db.$disconnect();process.exit(1);});
