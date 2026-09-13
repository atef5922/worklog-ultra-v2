import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { isSuperAdmin } from "@/lib/auth/policy";
import { AccessControl } from "@/components/management/access-control";
export default async function AccessControlPage(){const actor=await requireUser();if(!isSuperAdmin(actor))redirect('/dashboard');return <AccessControl/>;}
