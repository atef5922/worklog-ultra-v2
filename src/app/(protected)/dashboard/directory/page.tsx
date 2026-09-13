import {redirect} from 'next/navigation';
import {requireUser} from '@/lib/auth/server';
import {can} from '@/lib/auth/policy';
export default async function DirectoryPage({searchParams}:{searchParams:Promise<{departmentId?:string;userId?:string}>}){
 const actor=await requireUser();if(!can(actor,'employees.view'))redirect('/dashboard');
 const input=await searchParams;const query=new URLSearchParams();
 if(input.departmentId)query.set('departmentId',input.departmentId);if(input.userId)query.set('userId',input.userId);
 redirect('/management'+(query.size?'?'+query.toString():''));
}
