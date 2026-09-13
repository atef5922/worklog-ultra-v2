import {requireUser} from '@/lib/auth/server';
import {PermanentHistory} from '@/components/management/permanent-history';
export const dynamic='force-dynamic';
export default async function HistoryPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const actor=await requireUser();return <PermanentHistory userId={actor.id} search={await searchParams}/>;
}
