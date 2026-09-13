import {NextResponse} from 'next/server';
import {authenticate,fail} from '@/lib/management/server';
import {managementRecords} from '@/lib/management/records';
export async function GET(request:Request){try{const actor=await authenticate('employees.view');const data=await managementRecords(actor,new URL(request.url).searchParams);return NextResponse.json(data,{headers:{'Cache-Control':'no-store'}});}catch(e){return fail(e);}}
