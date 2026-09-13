import { UserRole } from '@prisma/client';
import {describe,it,expect} from 'vitest';
import {resolveScreenshotScope,screenshotScopeFilter,canViewScreenshot,canViewScreenshotsOfUser,canDeleteScreenshots} from './access';
describe('Excluded screenshot module role compatibility',()=>{
 for(const role of Object.values(UserRole)) it(role+' cannot gain access through a renamed role',()=>{
  const actor={id:'self',role,departmentId:'department'};
  expect(resolveScreenshotScope(actor)).toEqual(role==='super_admin'?{kind:'all'}:{kind:'self',userId:'self'});
  expect(canViewScreenshot(actor,{userId:'other',departmentId:'department'})).toBe(role==='super_admin');
  expect(canViewScreenshotsOfUser(actor,{id:'other',departmentId:'department'})).toBe(role==='super_admin');
  expect(canViewScreenshot(actor,{userId:'self',departmentId:null})).toBe(true);
  expect(canDeleteScreenshots(actor)).toBe(role==='super_admin');
 });
 it('never broadens a denied query',()=>expect(screenshotScopeFilter({kind:'none'})).not.toEqual({}));
});
