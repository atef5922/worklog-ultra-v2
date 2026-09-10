"use client";

import Link from "next/link";
import { Activity, ArrowRight, CheckCircle2, CircleAlert, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatMinutes } from "@/lib/utils";

type PerformanceMember = {
  id: string;
  name: string;
  role: string;
  departmentId: string;
  departmentName: string;
  avatarUrl: string | null;
  score: number;
  completionRate: number;
  trackedMinutes: number;
  completedCount: number;
  plannedCount: number;
  missedCount: number;
  goodTasks: string[];
  missedTasks: string[];
};

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function roleLabel(role: string) {
  if (role === "manager") return "Team Head";
  if (role === "admin") return "CEO/Admin";
  if (role === "hr") return "HR";
  return "Employee";
}

export function DashboardPerformanceSpotlight({
  topPerformer,
  steadyPerformer,
  members,
}: {
  topPerformer: PerformanceMember | null;
  steadyPerformer: PerformanceMember | null;
  members: PerformanceMember[];
}) {
  const initialSelected = topPerformer?.id ?? steadyPerformer?.id ?? members[0]?.id ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(initialSelected);

  const selectedMember = useMemo(
    () => members.find((member) => member.id === selectedId) ?? topPerformer ?? steadyPerformer ?? members[0] ?? null,
    [members, selectedId, steadyPerformer, topPerformer],
  );

  const cards = [
    topPerformer
      ? {
          key: "top",
          label: "Best Today",
          accent: "bg-emerald-50 text-emerald-700 border-emerald-200",
          icon: Sparkles,
          member: topPerformer,
        }
      : null,
    steadyPerformer
      ? {
          key: "steady",
          label: "Needs Eye",
          accent: "bg-amber-50 text-amber-700 border-amber-200",
          icon: Activity,
          member: steadyPerformer,
        }
      : null,
  ].filter(Boolean) as Array<{
    key: string;
    label: string;
    accent: string;
    border: string;
    icon: typeof Sparkles;
    member: PerformanceMember;
  }>;

  if (!cards.length || !selectedMember) {
    return null;
  }

  return (
    <div className="rounded-[26px] border border-[var(--panel-border)] bg-[var(--panel)] p-5 shadow-[var(--shadow)]">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-xl font-bold text-[var(--foreground)]">Performance Spotlight</h3>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">Quick view of who is leading well and who may need follow-up today.</p>
        </div>
        <Link className="text-sm font-semibold text-[#4f5ef7]" href="/dashboard/directory">
          Open monitor
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        {cards.map((card, index) => {
          const Icon = card.icon;
          const active = selectedMember.id === card.member.id;

          return (
            <button
              className={`flex min-w-[260px] flex-1 items-center justify-between gap-3 rounded-[20px] border px-4 py-3 text-left transition ${
                active ? "border-[#4f5ef7] bg-[var(--panel-muted)] shadow-[0_14px_30px_rgba(79,94,247,0.10)]" : "border-[var(--panel-border)] bg-[var(--panel)]"
              }`}
              key={card.key}
              onClick={() => setSelectedId(card.member.id)}
              type="button"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${card.accent}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">{card.label}</p>
                  <p className="truncate text-base font-semibold text-[var(--foreground)]">{card.member.name}</p>
                  <p className="truncate text-xs text-[var(--muted-foreground)]">{card.member.departmentName}</p>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-bold text-[var(--foreground)]">{card.member.score}</p>
                <p className="text-[11px] text-[var(--muted-foreground)]">score</p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-4 rounded-[22px] border border-[var(--panel-border)] bg-[var(--panel-muted)] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              {selectedMember.avatarUrl ? <AvatarImage alt={selectedMember.name} src={selectedMember.avatarUrl} /> : null}
              <AvatarFallback>{getInitials(selectedMember.name)}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-base font-semibold text-[var(--foreground)]">{selectedMember.name}</p>
              <p className="text-sm text-[var(--muted-foreground)]">{selectedMember.departmentName} - {roleLabel(selectedMember.role)}</p>
            </div>
          </div>
          <Link
            className="inline-flex items-center gap-2 rounded-2xl bg-[#4f5ef7] px-4 py-2 text-sm font-semibold text-white"
            href={`/dashboard/directory?departmentId=${encodeURIComponent(selectedMember.departmentId)}&userId=${encodeURIComponent(selectedMember.id)}`}
          >
            Open monitor
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Done</p>
            <p className="mt-1 text-lg font-semibold text-[var(--foreground)]">{selectedMember.completedCount}/{selectedMember.plannedCount}</p>
          </div>
          <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Tracked</p>
            <p className="mt-1 text-lg font-semibold text-[var(--foreground)]">{formatMinutes(selectedMember.trackedMinutes)}</p>
          </div>
          <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Missed</p>
            <p className="mt-1 text-lg font-semibold text-[var(--foreground)]">{selectedMember.missedCount}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-700" />
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Doing well</p>
            </div>
            <div className="mt-3 space-y-2">
              {selectedMember.goodTasks.length ? (
                selectedMember.goodTasks.slice(0, 2).map((task, index) => (
                  <p className="text-sm font-medium text-emerald-800" key={`${selectedMember.id}:good:${index}:${task}`}>
                    {task}
                  </p>
                ))
              ) : (
                <p className="text-sm text-emerald-800">No completed task yet.</p>
              )}
            </div>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
            <div className="flex items-center gap-2">
              <CircleAlert className="h-4 w-4 text-amber-700" />
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Needs follow-up</p>
            </div>
            <div className="mt-3 space-y-2">
              {selectedMember.missedTasks.length ? (
                selectedMember.missedTasks.slice(0, 2).map((task, index) => (
                  <p className="text-sm font-medium text-amber-800" key={`${selectedMember.id}:missed:${index}:${task}`}>
                    {task}
                  </p>
                ))
              ) : (
                <p className="text-sm text-amber-800">No obvious missed task right now.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
