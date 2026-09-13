import {saveTaskPlanning} from '@/lib/management/task-planning';
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){return saveTaskPlanning(request,(await params).id);}
