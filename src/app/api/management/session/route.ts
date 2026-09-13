import { NextResponse } from "next/server";
import { getServerAuthContext } from "@/lib/auth/server";
export async function GET(){const {user}=await getServerAuthContext();if(!user)return NextResponse.json({message:'Please sign in.'},{status:401});return NextResponse.json({version:user.accessVersion,role:user.role,managementEnabled:user.managementEnabled},{headers:{'Cache-Control':'no-store'}});}
