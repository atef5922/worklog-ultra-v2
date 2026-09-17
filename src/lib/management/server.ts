import "server-only";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getServerAuthContext } from "@/lib/auth/server";
import { can, canOpenManagement, isSuperAdmin, type Permission } from "@/lib/auth/policy";
import { db } from "@/lib/db";

export const actorInclude = { department: true, team: true, permissions: true, accessScopes: true, ledTeams: {select:{id:true}} } as const;
export type Actor = Prisma.UserGetPayload<{include: typeof actorInclude}>;
export class AccessError extends Error { constructor(message: string, public status = 403) { super(message); } }
export async function authenticate(permission?: Permission | "super_admin") {
  const { user } = await getServerAuthContext();
  if (!user) throw new AccessError("Please sign in.", 401);
  if (permission === "super_admin" ? !isSuperAdmin(user) : permission ? !can(user, permission) : !canOpenManagement(user)) {
    throw new AccessError("You do not have access to this feature.");
  }
  return user;
}
export async function freshActor(tx: Prisma.TransactionClient, id: string) {
  const actor = await tx.user.findUnique({where:{id},include:actorInclude});
  if (!actor?.isActive) throw new AccessError("Your access has changed. Please sign in again.");
  return actor;
}
export async function lockTransaction(tx: Prisma.TransactionClient, key: string) {
  // PostgreSQL advisory-lock functions return void. Selecting that value
  // directly makes PrismaPg try to deserialize an unsupported void column.
  // Expose only a supported integer while retaining the transaction lock.
  await tx.$queryRaw<Array<{ locked: number }>>`SELECT 1::int AS locked FROM pg_advisory_xact_lock(hashtext(${key}))`;
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const requestUrl = new URL(request.url);
  if (origin === requestUrl.origin) return;

  // Next may expose localhost as request.url for a browser request made through
  // the machine's LAN address. Accept only the browser origin matching the
  // actual Host header and protocol; a different site remains forbidden.
  try {
    const originUrl = new URL(origin);
    const host = request.headers.get("host")?.trim().toLowerCase();
    const internalHost = ["localhost", "127.0.0.1", "[::1]"].includes(requestUrl.hostname.toLowerCase());
    if (internalHost && host && originUrl.protocol === requestUrl.protocol && originUrl.host.toLowerCase() === host) return;
  } catch {
    // Invalid origins are rejected below.
  }
  throw new AccessError("Cross-origin request denied.");
}
export function checkDashboardActionOrigin(request: Request) {
  checkOrigin(request);
}
export function fail(error: unknown) {
  if (error instanceof AccessError) return NextResponse.json({message:error.message},{status:error.status});
  if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002","P2034"].includes(error.code)) {
    return NextResponse.json({message:"This record changed. Refresh and try again."},{status:409});
  }
  console.error("Management request failed",error);
  return NextResponse.json({message:"Request could not be completed."},{status:500});
}
export async function audit(tx: Prisma.TransactionClient, actorId: string, targetId: string | null, action: string, before: unknown, after: unknown, reason?: string) {
  const json=(value:unknown)=>value == null ? Prisma.JsonNull : JSON.parse(JSON.stringify(value));
  await tx.managementAuditLog.create({data:{actorId,targetId,action,beforeValue:json(before),afterValue:json(after),reason}});
}
export async function requireManagedEmployee(actor: Actor, id: string, permission: Permission) {
  const { employeeScope } = await import("@/lib/auth/policy");
  const target = await db.user.findFirst({where:{AND:[{id},employeeScope(actor,permission)]},select:{id:true,name:true,departmentId:true,teamId:true,role:true,isActive:true}});
  if (!target) throw new AccessError("Employee is outside your permitted access.");
  return target;
}
