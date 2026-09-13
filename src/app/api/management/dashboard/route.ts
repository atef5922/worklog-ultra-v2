import {authenticate,fail} from '@/lib/management/server';
import {dashboardData} from '@/lib/management/dashboard-data';
import {NextResponse} from 'next/server';
export async function GET(request:Request){try{return NextResponse.json(await dashboardData(await authenticate('employees.view'),new URL(request.url).searchParams),{headers:{'Cache-Control':'private, no-store'}});}catch(e){return fail(e);}}
