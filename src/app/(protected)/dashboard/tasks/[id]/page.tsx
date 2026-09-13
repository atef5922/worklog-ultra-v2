import {requireUser} from '@/lib/auth/server';
import {TaskRecord} from '@/components/management/task-record';
export default async function TaskDetailsPage({params}:{params:Promise<{id:string}>}){const actor=await requireUser();const {id}=await params;return <TaskRecord actor={actor} taskId={id}/>;}
