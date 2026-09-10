"use client";

import { BellRing, Megaphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/page-header";
import { PanelHeader } from "@/components/dashboard/panel-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { NOTICES_READ_EVENT } from "@/lib/dashboard-live-events";

type Department = {
  id: string;
  name: string;
};

type Notice = {
  id: string;
  title: string;
  body: string;
  authorName: string;
  departmentName: string;
  publishedAt: string | null;
};

export function NoticesCenter({
  departments = [],
  notices = [],
  canPublish,
}: {
  departments: Department[];
  notices: Notice[];
  canPublish: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [targetDepartmentId, setTargetDepartmentId] = useState("all");
  const [saving, setSaving] = useState(false);

  // Landing on this page is itself "reading" every notice on it — the header
  // bell and the sidebar dot both key off notice-read:<id> in localStorage,
  // and neither one else ever writes it, so without this the badge would
  // stay lit forever for anyone who reads notices here instead of through
  // the bell dropdown.
  useEffect(() => {
    if (!notices.length) {
      return;
    }

    try {
      notices.forEach((notice) => {
        window.localStorage.setItem(`notice-read:${notice.id}`, "read");
      });
    } catch {
      // ignore storage errors
    }

    window.dispatchEvent(new Event(NOTICES_READ_EVENT));
  }, [notices]);

  async function publishNotice() {
    if (!title.trim()) {
      toast.error("Write the notice title first.");
      return;
    }

    if (!body.trim()) {
      toast.error("Write the notice details first.");
      return;
    }

    setSaving(true);
    const response = await fetch("/api/dashboard/notices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        body,
        targetDepartmentId: targetDepartmentId === "all" ? null : targetDepartmentId,
      }),
    });
    const result = (await response.json().catch(() => ({ message: "Notice publish failed." }))) as { message?: string };
    setSaving(false);

    if (!response.ok) {
      toast.error(result.message ?? "Notice publish failed.");
      return;
    }

    toast.success(result.message ?? "Notice published.");
    setTitle("");
    setBody("");
    setTargetDepartmentId("all");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <PageHeader
        icon={BellRing}
        subtitle="Department announcements everyone should see."
        title="Notices"
      />

      {canPublish ? (
        <div
          className="dashboard-accent accent-indigo rounded-[1.25rem] border border-[var(--panel-border)] bg-[var(--panel)] p-3 shadow-[var(--shadow)] sm:p-3.5"
          data-dashboard-panel
        >
          <PanelHeader icon={Megaphone} title="Publish Notice" />
          <div className="mt-2.5 space-y-3">
            <div>
              <Label>Notice Title</Label>
              <Input onChange={(event) => setTitle(event.target.value)} placeholder="Write a short notice title" value={title} />
            </div>
            <div>
              <Label>Target Department</Label>
              <Select onValueChange={setTargetDepartmentId} value={targetDepartmentId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {(departments ?? []).map((department) => (
                    <SelectItem key={department.id} value={department.id}>
                      {department.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notice Details</Label>
              <Textarea onChange={(event) => setBody(event.target.value)} placeholder="Write the full notice message" value={body} />
            </div>
            <Button
              className="button-force-white h-10 rounded-xl bg-[#4f5ef7] px-4 text-[0.82rem] shadow-[0_10px_22px_rgba(79,94,247,0.24)] hover:bg-[#4453eb]"
              disabled={saving}
              onClick={publishNotice}
              type="button"
            >
              {saving ? "Publishing..." : "Publish Notice"}
            </Button>
          </div>
        </div>
      ) : null}

      <div
        className="dashboard-accent accent-amber rounded-[1.25rem] border border-[var(--panel-border)] bg-[var(--panel)] p-3 shadow-[var(--shadow)] sm:p-3.5"
        data-dashboard-panel
      >
        <PanelHeader
          action={
            <span className="font-mono text-[0.68rem] font-semibold tabular-nums text-[var(--muted-foreground)]">
              {notices.length} active
            </span>
          }
          icon={BellRing}
          title="Active Notices"
          tone="bg-amber-500/10 text-amber-500"
        />
        <div className="mt-2.5 space-y-2">
          {notices.length ? (
            (notices ?? []).map((notice, index) => (
              <div
                key={notice.id}
                className="rounded-xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-3 transition-colors hover:border-amber-500/30"
              >
                <div className="flex flex-wrap items-start justify-between gap-2.5">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-amber-500/10 font-mono text-[0.625rem] font-bold tabular-nums text-amber-600">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0">
                      <p className="break-words text-[0.88rem] font-bold leading-snug text-[var(--foreground)]">{notice.title}</p>
                      <p className="mt-0.5 truncate text-[0.65rem] font-bold uppercase tracking-[0.16em] text-amber-600">
                        {notice.departmentName} · by {notice.authorName}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-[0.68rem] font-semibold tabular-nums text-[var(--muted-foreground)]">
                    {notice.publishedAt
                      ? new Intl.DateTimeFormat("en-BD", {
                          timeZone: "Asia/Dhaka",
                          day: "numeric",
                          month: "short",
                          hour: "numeric",
                          minute: "2-digit",
                        }).format(new Date(notice.publishedAt))
                      : "Just now"}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-line break-words text-[0.8rem] leading-6 text-[var(--foreground)]">{notice.body}</p>
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--panel-border)] bg-[var(--panel-muted)] px-3 py-6 text-center">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/10 text-amber-500">
                <BellRing className="h-4 w-4" />
              </span>
              <p className="text-[0.8rem] font-medium text-[var(--muted-foreground)]">No active notice right now.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
