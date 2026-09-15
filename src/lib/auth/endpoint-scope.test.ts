import {describe,expect,it} from 'vitest';
import {personalTaskScope,personalOrScopedTasks,departmentScope,type AccessActor} from './policy';

describe('personal and management endpoint boundaries',()=>{
  it.each(['employee','team_head','admin','moderator','super_admin'])('%s personal actions cannot mutate another employee task',role=>{
    expect(personalTaskScope({id:'self',role} as AccessActor)).toEqual({userId:'self'});
  });
  it.each(['employee','team_head','admin','moderator'])('%s without an explicit grant has no cross-employee task scope',role=>{
    expect(personalOrScopedTasks({id:'self',role},'tasks.view')).toEqual({OR:[{userId:'self'},{user:{id:{in:[]}}}]});
  });
  it('Super Admin task scope stays unrestricted outside Prisma OR branches',()=>{
    expect(personalOrScopedTasks({id:'self',role:'super_admin'},['tasks.view','history.view'])).toEqual({});
  });
  it('department grants cannot manage other departments',()=>{
    const actor:AccessActor={id:'a',role:'admin',managementEnabled:true,permissions:[{permissionKey:'departments.manage',isGranted:true}],accessScopes:[{scopeType:'departments',departmentId:'dept-a'}]};
    expect(departmentScope(actor,'departments.manage')).toEqual({id:{in:['dept-a']}});
  });
  it('department mutations do not widen a team-only scope',()=>{
    const actor:AccessActor={id:'a',role:'team_head',managementEnabled:true,permissions:[{permissionKey:'departments.manage',isGranted:true}],accessScopes:[{scopeType:'teams',teamId:'team-a'}]};
    expect(departmentScope(actor,'departments.manage')).toEqual({id:{in:[]}});
  });
});
