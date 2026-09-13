import {requireUser} from '@/lib/auth/server';
import {employeeScope} from '@/lib/auth/policy';
import {db} from '@/lib/db';
import {notFound} from 'next/navigation';
import {readChecklist} from '@/lib/management/task-insights';
import {TaskPlanningEditor} from '@/components/management/task-planning-editor';
export default async function PlanningPage({params}:{params:Promise<{id:string}>}){
 const actor=await requireUser();const {id}=await params;
 const task=await db.dailyTask.findFirst({where:{id,OR:[{userId:actor.id},{user:employeeScope(actor,'tasks.update')}]},include:{updates:{orderBy:[{reportDate:'desc'},{updatedAt:'desc'}],take:1}}});if(!task)notFound();
 const management=task.userId!==actor.id,canPlan=management||!task.assignedBy||task.assignedBy===actor.id;
 return <TaskPlanningEditor key={`${task.id}:${task.planningVersion}`} management={management} canPlan={canPlan} plan={{id:task.id,title:task.taskTitle,version:task.planningVersion,projectName:task.projectName,clientName:task.clientName,dueAt:task.dueAt?.toISOString()??null,estimatedMinutes:task.estimatedMinutes,checklist:readChecklist(task.checklist),status:task.updates[0]?.status??'pending'}}/>;
}
