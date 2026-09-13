import {redirect} from 'next/navigation';
import {requireUser} from '@/lib/auth/server';
import {canAccessTeamDashboard} from '@/lib/auth/permissions';
import {TeamWorkspace} from '@/components/management/team-workspace';
export const dynamic='force-dynamic';
export default async function TeamPage(){const actor=await requireUser();if(!canAccessTeamDashboard(actor))redirect('/dashboard');return <TeamWorkspace actor={actor}/>;}
