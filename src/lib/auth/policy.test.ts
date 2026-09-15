import {describe,it,expect} from 'vitest';
import {can,canOpenManagement,canViewAuditLogs,employeeScope,ownTeamScope,assigneeScope,canChangeProtectedAccount,READ_PERMISSIONS,type AccessActor} from './policy';
const user=(role:string,enabled=false):AccessActor=>({id:'a',role,isActive:true,managementEnabled:enabled,permissions:READ_PERMISSIONS.map(permissionKey=>({permissionKey,isGranted:true})),accessScopes:[{scopeType:'departments',departmentId:'dept-a'}]});
describe('individual management access',()=>{
 for(const role of ['moderator','admin','team_head']){
  it(`${role}: grants never enable the dashboard without explicit user gate`,()=>{expect(canOpenManagement(user(role))).toBe(false);expect(can(user(role),'employees.view')).toBe(false);expect(employeeScope(user(role),'employees.view')).toEqual({id:{in:[]}});});
  it(`${role}: read-only grant cannot write or export`,()=>{expect(can(user(role,true),'attendance.view')).toBe(true);expect(can(user(role,true),'attendance.correct')).toBe(false);expect(can(user(role,true),'tasks.assign')).toBe(false);expect(can(user(role,true),'reports.export')).toBe(false);});
 }
 it('employee never gets management even with forged gate and grants',()=>expect(canOpenManagement(user('employee',true))).toBe(false));
 it('inactive Super Admin cannot access',()=>expect(can({...user('super_admin'),isActive:false},'employees.view')).toBe(false));
 it('Super Admin full access',()=>expect(employeeScope(user('super_admin'),'employees.view')).toEqual({}));
 it('empty scope fails closed',()=>expect(employeeScope({...user('admin',true),accessScopes:[]},'employees.view')).toEqual({id:{in:[]}}));
 it('department scope stays exact',()=>expect(employeeScope(user('admin',true),'employees.view')).toEqual({OR:[{departmentId:'dept-a'}]}));
 it('own team without membership never becomes all company',()=>expect(employeeScope({...user('team_head',true),accessScopes:[{scopeType:'own_team'}]},'employees.view')).toEqual({id:{in:[]}}));
 it('Team Head base workspace uses led teams only',()=>expect(ownTeamScope({...user('team_head'),ledTeams:[{id:'team-a'}],teamId:'other'})).toEqual({teamId:{in:['team-a']}}));
 it('revoking dashboard immediately disables retained write grants',()=>expect(can({...user('admin'),permissions:[{permissionKey:'attendance.correct',isGranted:true}]},'attendance.correct')).toBe(false));
 it('role alone does not allow assigning tasks to others',()=>expect(assigneeScope(user('admin'))).toEqual({OR:[{id:'a'},{id:{in:[]}}]}));
 it('Super Admin can assign tasks to every active employee',()=>expect(assigneeScope(user('super_admin'))).toEqual({}));
 it('last Super Admin cannot be demoted',()=>expect(canChangeProtectedAccount(user('super_admin'),{id:'b',role:'super_admin'},'employee',true,1)).toBe(false));
 it('own Super Admin account cannot be disabled',()=>expect(canChangeProtectedAccount(user('super_admin'),{id:'a',role:'super_admin'},'super_admin',false,2)).toBe(false));
 it('another Super Admin can be demoted while one remains',()=>expect(canChangeProtectedAccount(user('super_admin'),{id:'b',role:'super_admin'},'employee',true,2)).toBe(true));
 it('HR cannot modify roles',()=>expect(canChangeProtectedAccount(user('admin',true),{id:'b',role:'employee'},'super_admin',true,2)).toBe(false));
 it('Super Admin can always view audit logs',()=>expect(canViewAuditLogs(user('super_admin'))).toBe(true));
 it.each(['moderator','admin'])('%s needs both management access and an explicit audit grant',(role)=>{
  expect(canViewAuditLogs(user(role,true))).toBe(false);
  expect(canViewAuditLogs({...user(role,true),permissions:[{permissionKey:'audit_logs.view',isGranted:true}]})).toBe(true);
 });
 it('Team Head cannot view audit logs even with a stale or forged grant',()=>expect(canViewAuditLogs({
  ...user('team_head',true),permissions:[{permissionKey:'audit_logs.view',isGranted:true}],
 })).toBe(false));
});
