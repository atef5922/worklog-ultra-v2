import {postTaskTimer} from '@/lib/task-timer-service';
export function POST(request: Request, {params}: {params: Promise<{id: string}>}) {
  return params.then(({id}) => postTaskTimer(request, id));
}
