import {describe,it,expect} from 'vitest';
import {validateAttendanceCorrection as validate} from './attendance-validation';
const session=(start:string,end:string)=>({startedAt:`2026-09-12T${start}:00+06:00`,endedAt:`2026-09-12T${end}:00+06:00`});
const now=new Date('2026-09-13T00:00:00+06:00');
describe('attendance corrections',()=>{
 it('accepts multiple office sessions and included lunch',()=>expect(validate('2026-09-12',[session('10:00','16:00'),session('17:00','20:00')],[session('14:00','14:45')],0,now)).toBeNull());
 it('rejects overlapping office sessions',()=>expect(validate('2026-09-12',[session('10:00','16:00'),session('15:00','20:00')],[],0,now)).toMatch(/overlap/));
 it('rejects break during outside gap',()=>expect(validate('2026-09-12',[session('10:00','16:00'),session('17:00','20:00')],[session('16:05','16:45')],0,now)).toMatch(/inside/));
 it('rejects future work',()=>expect(validate('2026-09-12',[session('10:00','20:00')],[],0,new Date('2026-09-12T19:00:00+06:00'))).toMatch(/future/));
 it('rejects excessive legacy breaks',()=>expect(validate('2026-09-12',[session('10:00','11:00')],[],65,now)).toMatch(/exceeds/));
});
