import {describe,it,expect} from 'vitest';
import {taskProgress,deadlineState,presenceState,taskInPeriod,planningSchema,readChecklist} from './task-insights';
const now=new Date('2026-09-13T12:00:00Z');
describe('Management task calculations',()=>{
 it('never invents partial progress for tasks without a checklist',()=>{expect(taskProgress('pending',[])).toBeNull();expect(taskProgress('in_progress',[])).toBeNull();expect(taskProgress('done',[])).toBe(100);});
 it('computes checklist progress but does not change status',()=>{const list=[{id:'a',title:'One',done:true},{id:'b',title:'Two',done:false}];expect(taskProgress('in_progress',list)).toBe(50);expect(taskProgress('done',list)).toBe(100);});
 it('uses strict overdue and a 24-hour urgent window',()=>{expect(deadlineState('pending',new Date(now.getTime()-1),now)).toBe('overdue');expect(deadlineState('pending',now,now)).toBe('urgent');expect(deadlineState('done',new Date(0),now)).toBe('none');expect(deadlineState('pending',null,now)).toBe('none');expect(deadlineState('pending',new Date(now.getTime()+86400001),now)).toBe('upcoming');});
 it('rejects malformed checklist data without manufacturing progress',()=>expect(readChecklist({done:true})).toEqual([]));
 it('rejects duplicate checklist IDs and invalid estimates',()=>expect(planningSchema.safeParse({version:0,projectName:null,clientName:null,dueAt:null,estimatedMinutes:-1,checklist:[]}).success).toBe(false));
 it('carries unfinished older tasks forward but not completed older tasks',()=>{const task={planDate:new Date('2026-09-10'),updates:[{reportDate:new Date('2026-09-10'),status:'in_progress'}]};expect(taskInPeriod(task,'2026-09-13','2026-09-13')).toBe(true);expect(taskInPeriod({...task,updates:[{reportDate:new Date('2026-09-10'),status:'done'}]},'2026-09-13','2026-09-13')).toBe(false);});
 it('does not use future completion to rewrite a historical period',()=>expect(taskInPeriod({planDate:new Date('2026-09-10'),updates:[{reportDate:new Date('2026-09-14'),status:'done'}]},'2026-09-13','2026-09-13')).toBe(true));
});
describe('Event-based live status',()=>{
 const base={checkedIn:true,hasAttendance:true,onBreak:false,runningTasks:2,meetingStartedAt:null,sessionStartedAt:new Date('2026-09-13T04:00:00Z'),lastSeenAt:now};
 it('supports multiple running tasks without calling it attendance time',()=>expect(presenceState(base,now).state).toBe('Task running'));
 it('does not call a checked-in employee with no running task idle',()=>expect(presenceState({...base,runningTasks:0},now).state).toBe('Available'));
 it('gives checkout and breaks precedence over task state',()=>{expect(presenceState({...base,checkedIn:false},now).state).toBe('Checked out');expect(presenceState({...base,onBreak:true},now).state).toBe('On break');});
 it('never uses lost connectivity as checkout or a deduction',()=>{expect(presenceState({...base,lastSeenAt:new Date(0)},now)).toMatchObject({state:'Task running',connected:false});});
 it('ignores a stale meeting from a previous attendance session',()=>{expect(presenceState({...base,meetingStartedAt:new Date('2026-09-12T04:00:00Z')},now).state).toBe('Task running');expect(presenceState({...base,meetingStartedAt:now},now).state).toBe('In meeting');});
});
