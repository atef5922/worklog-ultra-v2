import {z} from 'zod';
import {authenticate,checkOrigin,fail,AccessError} from '@/lib/management/server';
import {changeAccountStatus} from '@/lib/management/account-status';
import {apiSuccess} from '@/lib/api';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{
 checkOrigin(request);const actor=await authenticate('employees.status.manage');
 const input=z.object({isActive:z.boolean(),reason:z.string().trim().min(3).max(500).optional()}).safeParse(await request.json().catch(()=>null));
 if(!input.success)throw new AccessError('A valid account status is required.',400);
 const {id}=await params;if(!z.string().uuid().safeParse(id).success)throw new AccessError('Invalid employee ID.',400);
 const user=await changeAccountStatus(actor,id,input.data.isActive,input.data.reason??'Account status changed by authorized manager');
 return apiSuccess({message:'Account status saved.',user});
}catch(error){return fail(error);}}
