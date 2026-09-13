import {redirect} from 'next/navigation';
import {requireAdminOrManager} from '@/lib/auth/server';
export default async function AdminUsersPage(){await requireAdminOrManager();redirect('/admin/access-control');}
