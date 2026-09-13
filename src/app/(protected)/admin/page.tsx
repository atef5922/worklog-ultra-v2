import {redirect} from 'next/navigation';
import {requireAdminOrManager} from '@/lib/auth/server';
export default async function AdminPage(){await requireAdminOrManager();redirect('/admin/access-control');}
