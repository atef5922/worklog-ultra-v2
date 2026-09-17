import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
vi.mock('server-only', () => ({}));
const m = vi.hoisted(() => ({users: vi.fn(), person: vi.fn(), tasks: vi.fn(), attendance: vi.fn(),overrides:vi.fn(),count:vi.fn()}));
vi.mock('@/lib/db', () => ({db: {user: {count:m.count,findMany: m.users, findFirst: m.person}, dailyTask: {findMany: m.tasks}, attendanceRecord: {findMany: m.attendance}, attendanceDayOverride: {findMany: m.overrides}}}));
vi.mock('@/lib/auth/server', () => ({getServerAuthContext: vi.fn()}));
import {employeeDetails, recordMetrics, managementRecords, dateRange} from './records';
import {dashboardData} from './dashboard-data';
const actor = {id: 'manager', role: 'super_admin', managementEnabled: true, isActive: true, permissions: [], accessScopes: []};
const at = (s: string) => new Date(s+'+06:00');
const work = (start: string, end: string | null) => ({startedAt: at(start), endedAt: end ? at(end) : null});
beforeEach(() => {vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(at('2026-09-15T02:00:00')); m.count.mockResolvedValue(1); m.person.mockResolvedValue({id: 'employee'}); m.tasks.mockResolvedValue([]); m.attendance.mockResolvedValue([]); m.overrides.mockResolvedValue([]);});
afterEach(() => vi.useRealTimers());
describe('Management overnight attendance and historical bounds', () => {
 it('shows open overnight presence without charging its hours to two report dates',async()=>{
  m.users.mockResolvedValue([{id:'employee',name:'Employee',role:'employee',isActive:true,department:null,team:null,taskOwner:[],
   attendanceRecords:[{attendanceDate:new Date('2026-09-14'),legacyBreakMinutes:0,workSessions:[work('2026-09-14T21:00:00',null)],breakSessions:[]}]}]);
  const result=await managementRecords(actor,new URLSearchParams({from:'2026-09-15',to:'2026-09-15'}));
  expect(result.rows[0]).toMatchObject({state:'Working',actual:0,counted:0});
  expect(m.users.mock.calls[0][0].select.attendanceRecords.where.OR).toContainEqual({workSessions:{some:{endedAt:null}}});
 });
 it.each([{from:'2026-02-30',to:'2026-03-01'},{from:'2026-09-15',to:'2026-09-14'},{from:'2020-01-01',to:'2026-09-14'}])('rejects invalid or excessive date ranges: %o',range=>{
  expect(()=>dateRange(new URLSearchParams(range))).toThrow('valid date range');
 });

  it('keeps the full overnight session on its original attendance workday', () => {
    const result = recordMetrics({attendanceDate: new Date('2026-09-14'), legacyBreakMinutes: 0,
      workSessions: [work('2026-09-14T21:00:00', '2026-09-15T02:00:00')], breakSessions: []});
    expect(result.activeMinutes).toBe(300); expect(result.overtimeMinutes).toBe(300);
  });
  it('does not cut an open overnight session at midnight', () => {
    expect(recordMetrics({attendanceDate: new Date('2026-09-14'), legacyBreakMinutes: 0,
      workSessions: [work('2026-09-14T23:00:00', null)], breakSessions: []}).activeMinutes).toBe(180);
  });
  it('bounds employee task updates to the selected end date', async () => {
    await employeeDetails(actor, 'employee', new URLSearchParams({from: '2026-09-13', to: '2026-09-14'}));
    expect(m.tasks.mock.calls[0][0].include.updates.where).toEqual({reportDate: {lte: new Date('2026-09-14')}});
    expect(m.tasks.mock.calls[0][0].include.timerStates).toBe(true);
  });
  it('includes legacy completed tasks in history and bounds returned events', async () => {
    await employeeDetails(actor, 'employee', new URLSearchParams({from: '2026-09-13', to: '2026-09-14'}));
    const query = m.tasks.mock.calls[1][0];
    expect(query.where.OR).toContainEqual({updates: {some: {status: 'done', reportDate: {gte: new Date('2026-09-13'), lte: new Date('2026-09-14')}}}});
    expect(query.include.activityEvents.where).toEqual({reportDate: {gte: new Date('2026-09-13'), lte: new Date('2026-09-14')}});
  });
  it('live status ignores an open session from a previous workday', async () => {
    m.users.mockResolvedValueOnce([{id: 'employee', name: 'Employee', department: null}]).mockResolvedValueOnce([{
      id: 'employee', name: 'Employee', avatarUrl: null, taskOwner: [], presence: null,
      attendanceRecords: [
        {attendanceDate: new Date('2026-09-15'), checkInAt: at('2026-09-15T00:00:00'), workSessions: [], breakSessions: []},
        {attendanceDate: new Date('2026-09-14'), checkInAt: at('2026-09-14T21:00:00'), workSessions: [work('2026-09-14T21:00:00', null)], breakSessions: []},
      ],
    }]);
    const result = await dashboardData(actor, new URLSearchParams());
    expect(m.users.mock.calls[1][0].select.attendanceRecords.where).toEqual({attendanceDate: new Date('2026-09-15')});
    expect(result.live[0].state).toBe('Checked out');
  });
  it('shows not checked in when only a previous workday has an open session', async () => {
    m.users.mockResolvedValueOnce([{id: 'employee', name: 'Employee', department: null}]).mockResolvedValueOnce([{
      id: 'employee', name: 'Employee', avatarUrl: null, taskOwner: [], presence: null,
      attendanceRecords: [{attendanceDate: new Date('2026-09-14'), checkInAt: at('2026-09-14T21:00:00'), workSessions: [work('2026-09-14T21:00:00', null)], breakSessions: []}],
    }]);
    const result = await dashboardData(actor, new URLSearchParams());
    expect(result.live[0].state).toBe('Not checked in');
  });
  it('counts late check-ins as present and includes the 10:00 boundary', async () => {
    vi.setSystemTime(at('2026-09-15T17:00:00'));
    const people=['a','b','c','d','e'].map(id=>({id,name:id,createdAt:new Date('2026-01-01'),department:null}));
    const live=people.map(person=>({id:person.id,name:person.name,avatarUrl:null,presence:null,attendanceRecords:[],taskOwner:[]}));
    m.users.mockResolvedValueOnce(people).mockResolvedValueOnce(live);
    m.attendance.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {userId:'a',attendanceDate:new Date('2026-09-15'),workSessions:[{startedAt:at('2026-09-15T09:00:00')}]},
      {userId:'b',attendanceDate:new Date('2026-09-15'),workSessions:[{startedAt:at('2026-09-15T10:01:00')}]},
      {userId:'e',attendanceDate:new Date('2026-09-15'),workSessions:[{startedAt:at('2026-09-15T10:00:00')}]},
    ]);
    m.overrides.mockResolvedValue([{attendanceDate:new Date('2026-09-15'),subjectKey:'employee:d',kind:'leave',reason:'Approved leave'}]);
    const result=await dashboardData(actor,new URLSearchParams({attendancePeriod:'today'}));
    expect(result.attendance.summary).toEqual({period:'today',present:3,absent:1,late:1,total:4});
  });
  it.each([
    {period:'yesterday',from:'2026-09-14',to:'2026-09-14',workdays:1},
    {period:'last7',from:'2026-09-09',to:'2026-09-15',workdays:6},
  ])('uses the selected $period attendance dates', async ({period,from,to,workdays}) => {
    vi.setSystemTime(at('2026-09-15T17:00:00'));
    m.users.mockResolvedValueOnce([{id:'employee',name:'Employee',createdAt:new Date('2026-01-01'),department:null}])
      .mockResolvedValueOnce([{id:'employee',name:'Employee',avatarUrl:null,presence:null,attendanceRecords:[],taskOwner:[]}]);
    const result=await dashboardData(actor,new URLSearchParams({attendancePeriod:period}));
    expect(m.attendance.mock.calls[1][0].where.attendanceDate).toEqual({gte:new Date(from),lte:new Date(to)});
    expect(result.attendance.summary).toEqual({period,present:0,absent:workdays,late:0,total:workdays});
  });
});
