import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const query=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/db',()=>({db:{dailyTask:{findMany:query}}}));
import {projectTaskTimers,hasRunningTaskTimer} from './task-timer-projection';
import {getHistoryData,getPlanWithReports} from './worklog';
const day=new Date('2026-09-14'),start=new Date('2026-09-14T10:00:00+06:00');
function task(){return {id:'task',planDate:day,taskTitle:'Running task',taskDescription:null,editRequests:[],updates:[{id:'update',reportDate:day,status:'in_progress',trackedMinutes:2,actualStart:start,actualEnd:null,note:null,completionPercent:0}],timerStates:[{reportDate:day,trackedMilliseconds:120500,actualStart:start,actualEnd:null,runningStartedAt:start}]};}
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-14T10:30:00+06:00'));query.mockResolvedValue([task()]);});
afterEach(()=>vi.useRealTimers());
describe('server timer read projections',()=>{
 it('projects current segments without mutating saved rows or audit evidence',()=>{const original=task(),copy=structuredClone(original);expect(projectTaskTimers(original).updates[0].trackedMinutes).toBe(32);expect(original).toEqual(copy);expect(hasRunningTaskTimer(original)).toBe(true);});
 it('caps old workdays at the existing task midnight boundary',()=>{vi.setSystemTime(new Date('2026-09-15T02:00:00+06:00'));const old=task();old.timerStates[0].trackedMilliseconds=0;const projected=projectTaskTimers(old);expect(projected.updates[0].trackedMinutes).toBe(840);expect(projected.updates[0].actualEnd).toEqual(new Date('2026-09-15T00:00:00+06:00'));expect(hasRunningTaskTimer(old)).toBe(false);});
 it('leaves legacy saved records unchanged when there is no durable timer',()=>{const legacy={...task(),timerStates:[]};expect(projectTaskTimers(legacy)).toEqual(legacy);expect(hasRunningTaskTimer(legacy)).toBe(false);});
 it('includes current running work in the employee report',async()=>{const records=await getHistoryData('employee','2026-09-14','2026-09-14');expect(records).toHaveLength(1);expect(records[0].updates[0].trackedMinutes).toBe(32);expect(query.mock.calls.at(-1)?.[0].include.timerStates).toBe(true);});
 it('seeds the work plan from the same projected server minutes',async()=>{expect((await getPlanWithReports('employee'))[0].updates[0].trackedMinutes).toBe(32);});
});
