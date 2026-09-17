import { DateInput } from "@/components/ui/date-input";
import {ChevronDown, ClipboardCheck, Filter, Search, ShieldCheck, UserRound} from "lucide-react";
import Link from "next/link";
import {redirect} from "next/navigation";
import type {Prisma} from "@prisma/client";
import {requireUser} from "@/lib/auth/server";
import {canViewAuditLogs,employeeScope,isSuperAdmin} from "@/lib/auth/policy";
import {db} from "@/lib/db";
import {auditActionLabel,auditActionSummary,formatAuditEvidence} from "@/lib/management/audit-log";
import {formatDateTimeInDhaka} from "@/lib/utils";

type AuditSearch = {
  page?: string | string[];
  from?: string | string[];
  to?: string | string[];
  action?: string | string[];
  employee?: string | string[];
};

const fieldClass = "h-9 w-full rounded-lg border border-[var(--panel-border)] bg-[var(--panel)] px-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const scalar = (value?: string | string[]) => Array.isArray(value) ? value[0] ?? "" : value ?? "";
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());

function pageHref(search: AuditSearch, page: number) {
  const params = new URLSearchParams();
  for (const key of ["from","to","action","employee"] as const) {
    const value = scalar(search[key]).trim();
    if (value) params.set(key,value);
  }
  params.set("page",String(page));
  return `?${params.toString()}`;
}

export default async function AuditPage({searchParams}:{searchParams:Promise<AuditSearch>}) {
  const actor = await requireUser();
  if (!canViewAuditLogs(actor)) redirect("/dashboard");
  const search = await searchParams;
  const fromInput = scalar(search.from), toInput = scalar(search.to);
  const from = validDate(fromInput) ? fromInput : "";
  const to = validDate(toInput) ? toInput : "";
  const action = scalar(search.action).trim().slice(0,100);
  const employee = scalar(search.employee).trim().slice(0,100);
  const requestedPage = Math.max(1,Math.min(10000,Number(scalar(search.page))||1));

  const scope = employeeScope(actor,"audit_logs.view");
  const companyWide = isSuperAdmin(actor) || actor.accessScopes?.some(item=>item.scopeType==="all_company")===true;
  const scopedIds = companyWide ? null : (await db.user.findMany({where:scope,select:{id:true}})).map(user=>user.id);
  const scopeWhere: Prisma.ManagementAuditLogWhereInput = scopedIds ? {targetId:{in:scopedIds}} : {};
  const matchedEmployeeIds = employee ? (await db.user.findMany({
    where:{AND:[scope,{OR:[{name:{contains:employee,mode:"insensitive"}},{email:{contains:employee,mode:"insensitive"}}]}]},
    select:{id:true},
  })).map(user=>user.id) : null;

  const createdAt: Prisma.DateTimeFilter = {};
  if (from) createdAt.gte = new Date(`${from}T00:00:00+06:00`);
  if (to) createdAt.lte = new Date(`${to}T23:59:59.999+06:00`);
  const where: Prisma.ManagementAuditLogWhereInput = {
    AND:[
      scopeWhere,
      ...(action ? [{action}] : []),
      ...(matchedEmployeeIds ? [{targetId:{in:matchedEmployeeIds}}] : []),
      ...((from||to) ? [{createdAt}] : []),
    ],
  };
  const [total,actionRows] = await Promise.all([
    db.managementAuditLog.count({where}),
    db.managementAuditLog.findMany({where:scopeWhere,distinct:["action"],select:{action:true},orderBy:{action:"asc"}}),
  ]);
  const pageCount = Math.max(1,Math.ceil(total/50));
  const page = Math.min(requestedPage,pageCount);
  const logs = await db.managementAuditLog.findMany({
    where,orderBy:[{createdAt:"desc"},{id:"desc"}],skip:(page-1)*50,take:50,
  });
  const personIds = [...new Set(logs.flatMap(log=>[log.actorId,log.targetId].filter((id):id is string=>typeof id==="string"&&uuidPattern.test(id))))];
  const people = personIds.length ? await db.user.findMany({
    where:{id:{in:personIds}},select:{id:true,name:true,email:true},
  }) : [];
  const peopleById = new Map(people.map(person=>[person.id,person]));

  return <div className="space-y-4 pb-4">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-xl bg-indigo-500/12 text-indigo-600"><ShieldCheck className="size-5"/></span>
          <div><h1 className="text-xl font-semibold text-[var(--foreground)]">Audit Log</h1><p className="text-sm text-[var(--muted-foreground)]">Permanent evidence of protected role, permission, task and attendance changes.</p></div>
        </div>
      </div>
      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">Read-only records</span>
    </header>

    <form className="rounded-xl border border-[var(--panel-border)] bg-[var(--panel)] p-3" method="get">
      <div className="grid gap-2 md:grid-cols-[minmax(150px,0.8fr)_minmax(150px,0.8fr)_minmax(190px,1fr)_minmax(220px,1.2fr)_auto_auto]">
        <label className="space-y-1 text-xs font-medium text-[var(--muted-foreground)]">From
          <span className="relative block"><DateInput className={fieldClass} name="from" defaultValue={from}/></span>
        </label>
        <label className="space-y-1 text-xs font-medium text-[var(--muted-foreground)]">To
          <span className="relative block"><DateInput className={fieldClass} name="to" defaultValue={to}/></span>
        </label>
        <label className="space-y-1 text-xs font-medium text-[var(--muted-foreground)]">Action
          <select className={fieldClass} name="action" defaultValue={action}><option value="">All actions</option>{actionRows.map(row=><option key={row.action} value={row.action}>{auditActionLabel(row.action)}</option>)}</select>
        </label>
        <label className="space-y-1 text-xs font-medium text-[var(--muted-foreground)]">Employee
          <span className="relative block"><Search className="pointer-events-none absolute left-3 top-2.5 size-4"/><input className={fieldClass} name="employee" defaultValue={employee} placeholder="Search name or email"/></span>
        </label>
        <button className="mt-auto inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white transition hover:bg-indigo-700" type="submit"><Filter className="size-4"/>Filter</button>
        <Link className="mt-auto inline-flex h-9 items-center justify-center rounded-lg border border-[var(--panel-border)] px-4 text-sm font-medium hover:bg-[var(--panel-alt)]" href="/management/audit">Reset</Link>
      </div>
    </form>

    <section className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-[var(--panel-border)] bg-[var(--panel)] p-3"><p className="text-xs text-[var(--muted-foreground)]">Matching records</p><p className="mt-1 text-xl font-semibold">{total}</p></div>
      <div className="rounded-xl border border-[var(--panel-border)] bg-[var(--panel)] p-3"><p className="text-xs text-[var(--muted-foreground)]">Access level</p><p className="mt-1 text-sm font-semibold">{companyWide?"Company-wide audit":"Permission and scope restricted"}</p></div>
      <div className="rounded-xl border border-[var(--panel-border)] bg-[var(--panel)] p-3"><p className="text-xs text-[var(--muted-foreground)]">Record policy</p><p className="mt-1 text-sm font-semibold">Permanent and read-only</p></div>
    </section>

    <section className="space-y-2">
      {logs.length===0?<div className="rounded-xl border border-dashed border-[var(--panel-border)] bg-[var(--panel)] px-6 py-12 text-center"><ClipboardCheck className="mx-auto size-8 text-[var(--muted-foreground)]"/><h2 className="mt-3 font-semibold">No audit records found</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">Adjust the date, action or employee filter.</p></div>:logs.map(log=>{
        const actorPerson=peopleById.get(log.actorId),targetPerson=log.targetId?peopleById.get(log.targetId):null;
        const actorName=actorPerson?.name??"System process",targetName=targetPerson?.name??(log.targetId?"Protected employee":"Company setting");
        return <details key={log.id} className="group overflow-hidden rounded-xl border border-[var(--panel-border)] bg-[var(--panel)]">
          <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 transition hover:bg-[var(--panel-alt)]">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-indigo-500/10 text-indigo-600"><ClipboardCheck className="size-4"/></span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{auditActionLabel(log.action)}</span><span className="block truncate text-xs text-[var(--muted-foreground)]">{auditActionSummary(log.action,targetName)}</span></span>
            <span className="hidden text-right text-xs text-[var(--muted-foreground)] sm:block">{formatDateTimeInDhaka(log.createdAt)}<span className="mt-0.5 block">by {actorName}</span></span>
            <ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180"/>
          </summary>
          <div className="border-t border-[var(--panel-border)] bg-[var(--panel-alt)]/45 p-4">
            <div className="grid gap-3 text-sm md:grid-cols-3">
              <div className="rounded-lg border border-[var(--panel-border)] bg-[var(--panel)] p-3"><p className="text-xs text-[var(--muted-foreground)]">Performed by</p><p className="mt-1 font-semibold">{actorName}</p>{actorPerson&&<p className="break-all text-xs text-[var(--muted-foreground)]">{actorPerson.email}</p>}</div>
              <div className="rounded-lg border border-[var(--panel-border)] bg-[var(--panel)] p-3"><p className="text-xs text-[var(--muted-foreground)]">Affected record</p><p className="mt-1 font-semibold">{targetName}</p>{targetPerson&&<p className="break-all text-xs text-[var(--muted-foreground)]">{targetPerson.email}</p>}</div>
              <div className="rounded-lg border border-[var(--panel-border)] bg-[var(--panel)] p-3"><p className="text-xs text-[var(--muted-foreground)]">Recorded at</p><p className="mt-1 font-semibold">{formatDateTimeInDhaka(log.createdAt)}</p></div>
            </div>
            <div className="mt-3 rounded-lg border border-[var(--panel-border)] bg-[var(--panel)] p-3 text-sm"><p className="text-xs text-[var(--muted-foreground)]">Reason</p><p className="mt-1">{log.reason??"No additional reason was recorded."}</p></div>
            <details className="mt-3 rounded-lg border border-[var(--panel-border)] bg-[var(--panel)]">
              <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium">View technical evidence</summary>
              <div className="grid gap-3 border-t border-[var(--panel-border)] p-3 md:grid-cols-2">
                <div><p className="mb-1 text-xs font-semibold text-[var(--muted-foreground)]">Before</p><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{formatAuditEvidence(log.beforeValue)}</pre></div>
                <div><p className="mb-1 text-xs font-semibold text-[var(--muted-foreground)]">After</p><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{formatAuditEvidence(log.afterValue)}</pre></div>
              </div>
            </details>
          </div>
        </details>;
      })}
    </section>

    {pageCount>1&&<nav className="flex items-center justify-between rounded-xl border border-[var(--panel-border)] bg-[var(--panel)] px-4 py-3 text-sm">
      <span className="text-[var(--muted-foreground)]">Page {page} of {pageCount}</span>
      <div className="flex gap-2">{page>1&&<Link className="rounded-lg border border-[var(--panel-border)] px-3 py-1.5 hover:bg-[var(--panel-alt)]" href={pageHref(search,page-1)}>Previous</Link>}{page<pageCount&&<Link className="rounded-lg border border-[var(--panel-border)] px-3 py-1.5 hover:bg-[var(--panel-alt)]" href={pageHref(search,page+1)}>Next</Link>}</div>
    </nav>}
    <p className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]"><UserRound className="size-3.5"/>Only Super Admin and explicitly authorized Moderator or Admin / HR accounts can view these records.</p>
  </div>;
}
