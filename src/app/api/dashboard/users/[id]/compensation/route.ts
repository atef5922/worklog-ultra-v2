import {apiError} from '@/lib/api';
import {getServerAuthContext} from '@/lib/auth/server';
// Compensation is out of this release's scope. Existing stored amounts are untouched.
export async function POST(){const {user}=await getServerAuthContext();if(!user)return apiError('Login required.',401);return apiError('Compensation management is not enabled.',403);}
