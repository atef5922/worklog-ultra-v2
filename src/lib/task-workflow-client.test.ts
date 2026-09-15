import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {captureTaskLifecycleSnapshot,completePersonalTask,reopenPersonalTask,requestTaskJson,savePersonalTimer,timerAtSave} from './task-workflow-client';
import {saveTaskTimer,taskTimerSyncKey,type ServerTaskTimer} from './task-timer-client';
const taskId='11111111-1111-4111-8111-111111111111',userId='22222222-2222-4222-8222-222222222222',day='2026-09-14';
const commandId='33333333-3333-4333-8333-333333333333',revision='a'.repeat(64);
const fetchMock=vi.fn(),events=vi.fn(),cache=new Map<string,string>();
const snapshot={status:'in_progress' as const,revision,userId,reportDate:day,trackedMinutes:'2',trackedSeconds:'120',
 actualStart:'2026-09-14T04:00:00.000Z',actualEnd:'',runningStartedAt:'2026-09-14T05:59:30.000Z'};
const done={reportDate:day,status:'done',trackedMinutes:3,actualStart:snapshot.actualStart,actualEnd:'2026-09-14T06:00:00.000Z',note:'Reviewed'};
const reopenSnapshot={...snapshot,status:"done" as const,actualEnd:done.actualEnd,runningStartedAt:""};
const base:ServerTaskTimer={taskId,userId,reportDate:day,revision,status:'in_progress',trackedMilliseconds:120000,actualStart:snapshot.actualStart,
 actualEnd:null,runningStartedAt:snapshot.runningStartedAt,serverNow:'2026-09-14T06:00:00.000Z',canStart:false,lastCommandId:null,lastAction:null};
const completed={...base,status:'done',trackedMilliseconds:181500,actualEnd:done.actualEnd,runningStartedAt:null,lastCommandId:commandId,lastAction:'complete'};
const respond=(body:unknown,status=200)=>fetchMock.mockImplementation(()=>Promise.resolve(Response.json(body,{status})));
beforeEach(()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date(base.serverNow));fetchMock.mockReset();events.mockClear();cache.clear();
 vi.stubGlobal('fetch',fetchMock);vi.stubGlobal('crypto',{randomUUID:()=>commandId});
 vi.stubGlobal('window',{dispatchEvent:events});
 vi.stubGlobal('localStorage',{setItem:(key:string,value:string)=>cache.set(key,value)});
});
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
describe('server-confirmed task workflow',()=>{
 it('blocks overlapping writes and releases the lock after saving',async()=>{
  let release!:(r:Response)=>void;fetchMock.mockImplementationOnce(()=>new Promise<Response>(resolve=>{release=resolve;}));
  const pending=savePersonalTimer(taskId,day,snapshot,'Note');
  await expect(completePersonalTask(taskId,'Reviewed',snapshot)).rejects.toThrow('already being saved');
  release(Response.json({message:'Saved',timer:base}));await pending;
  respond({message:'Completed',taskUpdate:done,timer:completed});
  await expect(completePersonalTask(taskId,'Reviewed',snapshot)).resolves.toMatchObject({update:done});
 });
 it('allows independent tasks to save concurrently',async()=>{
  fetchMock.mockImplementation((_url,init)=>{const body=JSON.parse(init.body);return Promise.resolve(Response.json({message:'Saved',timer:{...base,taskId:body.taskId}}));});
  await Promise.all([taskId,'44444444-4444-4444-8444-444444444444'].map(id=>savePersonalTimer(id,day,snapshot,'Note')));
  expect(fetchMock).toHaveBeenCalledTimes(2);
 });
 it('retains the old display-only segment helper without sending its result',()=>{
  expect(timerAtSave(snapshot).trackedSeconds).toBe('150');
  expect(timerAtSave({...snapshot,runningStartedAt:''}).trackedSeconds).toBe('120');
 });
 it('does not double count a live display sample',()=>expect(timerAtSave({...snapshot,trackedSeconds:'149',sampledAt:Date.now()-1000}).trackedSeconds).toBe('150'));
 it('sends notes only, never elapsed time or status, to the report endpoint',async()=>{
  respond({message:'Saved',timer:base});await savePersonalTimer(taskId,day,snapshot,'Note');
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({action:'save_note',taskId,reportDate:day,note:'Note',expectedUserId:userId,expectedRevision:revision});
 });
 it('does not allow report-based Done',async()=>{
  await expect(savePersonalTimer(taskId,day,{...snapshot,status:'done'})).rejects.toThrow('Use Done');expect(fetchMock).not.toHaveBeenCalled();
 });
 it('does not publish completion on API failure',async()=>{
  respond({message:'Checklist incomplete'},409);await expect(completePersonalTask(taskId,'Keep note',snapshot)).rejects.toThrow('Checklist incomplete');expect(events).not.toHaveBeenCalled();
 });
 it('permits retry after a failed network request',async()=>{
  fetchMock.mockRejectedValueOnce(new TypeError('Network unavailable'));await expect(completePersonalTask(taskId,'Note',snapshot)).rejects.toThrow();expect(events).not.toHaveBeenCalled();
  respond({message:'Completed',taskUpdate:done,timer:completed});await completePersonalTask(taskId,'Note',snapshot);expect(events).toHaveBeenCalledTimes(1);
 });
 it.each(['','<html>Login</html>','null','{}'])('rejects misleading HTTP 200 body: %s',async body=>{
  fetchMock.mockResolvedValue(new Response(body));await expect(requestTaskJson('/api/example',{method:'POST'})).rejects.toThrow();
 });
 it('requires a confirmed update and server timer before publishing',async()=>{
  respond({message:'Completed',taskUpdate:done});await expect(completePersonalTask(taskId,'Note',snapshot)).rejects.toThrow('could not be confirmed');expect(events).not.toHaveBeenCalled();
 });
 it('uses exact server seconds and never sends client clock values with Done',async()=>{
  respond({message:'Completed',taskUpdate:done,timer:completed});const result=await completePersonalTask(taskId,'Reviewed',snapshot);
  expect(result.snapshot).toMatchObject({trackedSeconds:'181',actualEnd:done.actualEnd,runningStartedAt:''});
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({action:'complete_task',completionStatus:'done',completionNote:'Reviewed',commandId,reportDate:day,expectedUserId:userId,expectedRevision:revision});
  expect(cache.has(taskTimerSyncKey(userId))).toBe(true);
 });
 it('sends the captured opening revision directly when reopening, without a save-time read',async()=>{
  respond({message:'Reopened',taskUpdate:{...done,status:'in_progress'},timer:{...completed,status:'in_progress',lastAction:'reopen'}});
  const result=await reopenPersonalTask(taskId,'Additional testing needed',reopenSnapshot);expect(result.snapshot.status).toBe('in_progress');
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][1].method).toBe('POST');
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({expectedUserId:userId,expectedRevision:revision,reopenReason:'Additional testing needed'});
 });
 it('retains completion when reopen fails',async()=>{
  respond({message:'Reopen denied'},403);await expect(reopenPersonalTask(taskId,'Additional testing needed',reopenSnapshot)).rejects.toThrow('Reopen denied');expect(events).not.toHaveBeenCalled();
 });
 it('a storage failure cannot turn acknowledged completion into an error',async()=>{
  vi.stubGlobal('localStorage',{setItem:()=>{throw Error('Storage disabled');}});respond({message:'Completed',taskUpdate:done,timer:completed});
  await expect(completePersonalTask(taskId,'Reviewed',snapshot)).resolves.toMatchObject({update:done});
 });
 it('fails closed before synchronization',async()=>{
  await expect(completePersonalTask(taskId,'Note',{...snapshot,revision:undefined})).rejects.toThrow('synchronize');expect(fetchMock).not.toHaveBeenCalled();
 });
 it('recovers a lost Done acknowledgement without sending another completion',async()=>{
  fetchMock.mockRejectedValueOnce(new TypeError('Network unavailable')).mockResolvedValueOnce(Response.json({userId,timers:[{...completed,note:'Reviewed'}]}));
  const result=await completePersonalTask(taskId,'Reviewed',snapshot);expect(result.update.note).toBe('Reviewed');expect(result.update.status).toBe('done');
  expect(fetchMock.mock.calls.filter(c=>c[1]?.method==='POST')).toHaveLength(1);
 });
 it('recovers a lost Pause acknowledgement by reading the matching command',async()=>{
  const paused={...base,runningStartedAt:null,lastAction:'pause',lastCommandId:commandId};
  fetchMock.mockRejectedValueOnce(new TypeError('Network unavailable')).mockResolvedValueOnce(Response.json({userId,timers:[paused]}));
  await expect(saveTaskTimer(base,'pause')).resolves.toMatchObject({timer:paused});expect(fetchMock.mock.calls.filter(c=>c[1]?.method==='POST')).toHaveLength(1);
 });
 it('never replays a failed Pause using a newer revision',async()=>{
  fetchMock.mockRejectedValueOnce(new TypeError('Network unavailable')).mockResolvedValueOnce(Response.json({userId,timers:[{...base,revision:'b'.repeat(64),lastCommandId:'later',lastAction:'start'}]}));
  await expect(saveTaskTimer(base,'pause')).rejects.toThrow('Network unavailable');expect(fetchMock.mock.calls.filter(c=>c[1]?.method==='POST')).toHaveLength(1);
 });
 it('rejects a response belonging to another task or account',async()=>{
  respond({message:'Completed',taskUpdate:done,timer:{...completed,userId:taskId}});
  await expect(completePersonalTask(taskId,'Note',snapshot)).rejects.toThrow('could not be confirmed');expect(events).not.toHaveBeenCalled();
 });
});

describe('opening-revision lifecycle contract',()=>{
 it('captures a detached immutable dialog snapshot',()=>{
  const source={...snapshot,note:'Original completion evidence'};
  const captured=captureTaskLifecycleSnapshot(source,userId);
  source.revision='b'.repeat(64);source.reportDate='2026-09-15';source.note='Another cycle';
  expect(captured).toMatchObject({revision,reportDate:day,note:'Original completion evidence'});
  expect(Object.isFrozen(captured)).toBe(true);
 });
 it('rejects an opening snapshot from a different account',()=>{
  expect(()=>captureTaskLifecycleSnapshot(snapshot,taskId)).toThrow('account changed');
 });
 it.each(['revision','userId','reportDate'] as const)('rejects an opening snapshot without %s',key=>{
  expect(()=>captureTaskLifecycleSnapshot({...snapshot,[key]:undefined})).toThrow('synchronize');
 });
 it.each(['complete','reopen'] as const)('never rebases a stale %s dialog after recovery reads or repeated Save',async action=>{
  const opening=captureTaskLifecycleSnapshot(action==='complete'?snapshot:reopenSnapshot);
  const latest={...base,revision:'b'.repeat(64),lastCommandId:'another-command',lastAction:'start'};
  fetchMock.mockImplementation((_url,init)=>Promise.resolve(init?.method==='POST'
    ?Response.json({message:'Task changed; review it first'},{status:409})
    :Response.json({userId,timers:[latest]})));
  const save=()=>action==='complete'?completePersonalTask(taskId,'Original note',opening):reopenPersonalTask(taskId,'Original reason remains here',opening);
  await expect(save()).rejects.toThrow('Task changed');
  await expect(save()).rejects.toThrow('Task changed');
  const posts=fetchMock.mock.calls.filter(c=>c[1]?.method==='POST');
  expect(posts).toHaveLength(2);
  for(const [,init] of posts)expect(JSON.parse(init.body)).toMatchObject({expectedRevision:revision,expectedUserId:userId,reportDate:day});
  expect(opening.revision).toBe(revision);
 });
 it('keeps the opened report day even when midnight passes before Reopen Save',async()=>{
  const opening=captureTaskLifecycleSnapshot(reopenSnapshot);
  vi.setSystemTime(new Date('2026-09-15T04:00:00Z'));
  respond({message:'The workday changed'},409);
  await expect(reopenPersonalTask(taskId,'Original reason',opening)).rejects.toThrow('workday changed');
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({reportDate:day,expectedRevision:revision});
 });
 it('recovers a lost Reopen acknowledgement without a second write',async()=>{
  const reopened={...completed,status:'in_progress',lastAction:'reopen',note:'Reopened: Original reason'};
  fetchMock.mockRejectedValueOnce(new TypeError('Network unavailable')).mockResolvedValueOnce(Response.json({userId,timers:[reopened]}));
  const result=await reopenPersonalTask(taskId,'Original reason',reopenSnapshot);
  expect(result.update.status).toBe('in_progress');
  expect(fetchMock.mock.calls.filter(c=>c[1]?.method==='POST')).toHaveLength(1);
 });
});
