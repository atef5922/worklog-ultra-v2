"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

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
  departments,
  notices,
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
    <div className="space-y-5">
      {canPublish ? (
        <Card>
          <CardHeader>
            <CardTitle>Publish Notice</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
                  {departments.map((department) => (
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
            <Button className="button-force-white bg-[#315fe6] hover:bg-[#274fc0]" disabled={saving} onClick={publishNotice} type="button">
              {saving ? "Publishing..." : "Publish Notice"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Active Notices</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {notices.length ? (
            notices.map((notice) => (
              <div key={notice.id} className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-[var(--foreground)]">{notice.title}</p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-[0.22em] text-blue-600">
                      {notice.departmentName} · by {notice.authorName}
                    </p>
                  </div>
                  <span className="text-xs text-[var(--muted-foreground)]">
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
                <p className="mt-3 text-sm leading-6 text-[var(--foreground)]">{notice.body}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-[var(--muted-foreground)]">No active notice right now.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
