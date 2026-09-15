import {z} from 'zod';
export const checklistSchema=z.array(z.object({id:z.string().uuid(),title:z.string().trim().min(1).max(200),done:z.boolean()})).max(50).refine(items=>new Set(items.map(i=>i.id)).size===items.length,'Checklist IDs must be unique.');
export type ChecklistItem=z.infer<typeof checklistSchema>[number];
export function readChecklist(value:unknown):ChecklistItem[]{const parsed=checklistSchema.safeParse(value);return parsed.success?parsed.data:[];}
export function taskProgress(status:string,checklist:ChecklistItem[]){
 if(status==='done')return 100;
 if(!checklist.length)return null;
 // Checklist completion is evidence, not the final Done action.
 return Math.round(checklist.filter(i=>i.done).length/checklist.length*100);
}
export function taskTimeUsage(trackedMinutes:number,estimatedMinutes:number|null){
 const tracked=Math.max(0,Math.floor(trackedMinutes));
 if(estimatedMinutes===null||estimatedMinutes<=0)return {trackedMinutes:tracked,estimatedMinutes:null,usagePercent:null,overMinutes:0};
 const estimated=Math.floor(estimatedMinutes);
 return {trackedMinutes:tracked,estimatedMinutes:estimated,usagePercent:Math.round(tracked/estimated*100),overMinutes:Math.max(0,tracked-estimated)};
}
export function deadlineState(status:string,due:Date|string|null,now:Date){
 if(status==='done'||!due)return 'none';
 const ms=new Date(due).getTime()-now.getTime();
 if(!Number.isFinite(ms))return 'none';
 return ms<0?'overdue':ms<=86400000?'urgent':'upcoming';
}
export function taskInPeriod(task:{planDate:Date;updates:{reportDate:Date;status:string}[]},from:string,to:string){
 const date=(d:Date)=>d.toISOString().slice(0,10);
 if(date(task.planDate)>to)return false;
 const updates=task.updates.filter(u=>date(u.reportDate)<=to).sort((a,b)=>b.reportDate.getTime()-a.reportDate.getTime());
 return date(task.planDate)>=from||updates.some(u=>date(u.reportDate)>=from)||updates[0]?.status!=='done';
}
export type PresenceState='Task running'|'Available'|'On break'|'In meeting'|'Checked out'|'Not checked in';
export function presenceState(input:{checkedIn:boolean;hasAttendance:boolean;onBreak:boolean;runningTasks:number;meetingStartedAt:Date|null;sessionStartedAt:Date|null;lastSeenAt:Date|null},now:Date){
 const connected=!!input.lastSeenAt&&now.getTime()-input.lastSeenAt.getTime()<=120000;
 let state:PresenceState=!input.hasAttendance?'Not checked in':!input.checkedIn?'Checked out':input.onBreak?'On break':input.meetingStartedAt&&input.sessionStartedAt&&input.meetingStartedAt>=input.sessionStartedAt?'In meeting':input.runningTasks>0?'Task running':'Available';
 if(!input.hasAttendance)state='Not checked in';
 return {state,connected,lastSeenAt:input.lastSeenAt?.toISOString()??null};
}
export const planningSchema=z.object({version:z.number().int().nonnegative(),projectName:z.string().trim().max(120).nullable(),clientName:z.string().trim().max(120).nullable(),dueAt:z.string().datetime({offset:true}).nullable(),estimatedMinutes:z.number().int().min(1).max(525600).nullable(),checklist:checklistSchema,reason:z.string().trim().max(1000).optional()});
