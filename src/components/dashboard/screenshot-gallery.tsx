"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, Camera, Circle, ImageOff, Loader2, MonitorSmartphone, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDateTimeInDhaka, toDateOnly } from "@/lib/utils";

type FilterDepartment = { id: string; name: string };
type FilterEmployee = { id: string; name: string; departmentId: string | null; lastSeenAt: string | null; deviceLabel: string | null };

/**
 * How long since the desktop agent's last heartbeat before it reads as
 * offline. The agent pings every 60s (see screenshot-monitor.cjs), so this
 * tolerates two missed pings before flipping — enough to absorb an ordinary
 * network hiccup without flickering, not so much that a closed app still
 * reads as online.
 */
const ONLINE_THRESHOLD_MS = 3 * 60 * 1000;

function formatRelativeTime(value: string, nowMs: number) {
  const then = new Date(value).getTime();
  const diffSeconds = Math.max(0, Math.round((nowMs - then) / 1000));
  if (diffSeconds < 60) return "just now";
  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.round(diffHours / 24)}d ago`;
}

type ScreenshotItem = {
  id: string;
  userId: string;
  employeeName: string;
  capturedAt: string;
  width: number;
  height: number;
  fileSize: number;
  workSessionId: string | null;
  device: { id: string; label: string } | null;
  imageUrl: string;
};

type ListResponse = {
  success: boolean;
  message?: string;
  screenshots?: ScreenshotItem[];
  nextCursor?: string | null;
};

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ScreenshotGallery({
  departments,
  employees,
  isAdmin,
}: {
  departments: FilterDepartment[];
  employees: FilterEmployee[];
  isAdmin: boolean;
}) {
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>("all");
  const [selectedUserId, setSelectedUserId] = useState<string>("all");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>(() => toDateOnly());
  const [screenshots, setScreenshots] = useState<ScreenshotItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Ticks the online/offline read-out and its "Xm ago" text without a
  // network round trip — the underlying heartbeat data is already in
  // `employees` from the page load, this just keeps its age from going stale
  // on a gallery left open for a while.
  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const scopedEmployees = useMemo(() => {
    if (!isAdmin || selectedDepartmentId === "all") return employees;
    return employees.filter((employee) => employee.departmentId === selectedDepartmentId);
  }, [employees, isAdmin, selectedDepartmentId]);

  const selectedEmployee = useMemo(
    () => (selectedUserId === "all" ? null : (employees.find((employee) => employee.id === selectedUserId) ?? null)),
    [employees, selectedUserId],
  );

  const agentStatus = useMemo(() => {
    if (!selectedEmployee?.lastSeenAt) return null;
    const online = nowMs - new Date(selectedEmployee.lastSeenAt).getTime() < ONLINE_THRESHOLD_MS;
    return { online, lastSeenLabel: formatRelativeTime(selectedEmployee.lastSeenAt, nowMs) };
  }, [selectedEmployee, nowMs]);

  function buildQuery(cursor?: string) {
    const params = new URLSearchParams();
    if (selectedUserId !== "all") params.set("userId", selectedUserId);
    if (isAdmin && selectedDepartmentId !== "all") params.set("departmentId", selectedDepartmentId);
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    if (cursor) params.set("cursor", cursor);
    return params.toString();
  }

  async function loadFirstPage() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/dashboard/screenshots?${buildQuery()}`, { cache: "no-store" });
      const result = (await response.json()) as ListResponse;
      if (!response.ok || !result.success) {
        setError(result.message ?? "Screenshots could not be loaded.");
        setScreenshots([]);
        setNextCursor(null);
        return;
      }
      setScreenshots(result.screenshots ?? []);
      setNextCursor(result.nextCursor ?? null);
    } catch {
      setError("Screenshots could not be loaded. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const response = await fetch(`/api/dashboard/screenshots?${buildQuery(nextCursor)}`, { cache: "no-store" });
      const result = (await response.json()) as ListResponse;
      if (!response.ok || !result.success) {
        setError(result.message ?? "More screenshots could not be loaded.");
        return;
      }
      setScreenshots((current) => [...current, ...(result.screenshots ?? [])]);
      setNextCursor(result.nextCursor ?? null);
    } catch {
      setError("More screenshots could not be loaded. Check your connection and try again.");
    } finally {
      setLoadingMore(false);
    }
  }

  // Re-fetches from scratch on every filter change rather than filtering
  // client-side: the list is server-paginated, so the client only ever holds
  // one page at a time and never has the full set to filter locally.
  useEffect(() => {
    void loadFirstPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUserId, selectedDepartmentId, fromDate, toDate]);

  const activeShot = screenshots.find((item) => item.id === lightboxId) ?? null;

  async function handleDelete(id: string) {
    if (!window.confirm("Permanently delete this screenshot? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      const response = await fetch(`/api/dashboard/screenshots/${id}`, { method: "DELETE" });
      const result = (await response.json()) as { success: boolean; message?: string };
      if (!response.ok || !result.success) {
        toast.error(result.message ?? "Screenshot could not be deleted.");
        return;
      }
      setScreenshots((current) => current.filter((item) => item.id !== id));
      setLightboxId(null);
      toast.success("Screenshot deleted.");
    } catch {
      toast.error("Screenshot could not be deleted. Check your connection and try again.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <CardTitle>Screenshot Monitoring</CardTitle>
            <CardDescription>
              Captures taken automatically every 5 minutes while attendance is active. Access is limited to your team scope.
            </CardDescription>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[560px] xl:grid-cols-4">
            {isAdmin ? (
              <div className="min-w-0">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Department</p>
                <Select
                  onValueChange={(value) => {
                    setSelectedDepartmentId(value);
                    setSelectedUserId("all");
                  }}
                  value={selectedDepartmentId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All departments" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All departments</SelectItem>
                    {departments.map((department) => (
                      <SelectItem key={department.id} value={department.id}>
                        {department.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="min-w-0">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Employee</p>
              <Select onValueChange={setSelectedUserId} value={selectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="All employees" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All employees</SelectItem>
                  {scopedEmployees.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {employee.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">From</p>
              <input
                className="flex h-9 w-full rounded-lg border border-[var(--panel-border)] bg-[var(--panel)] px-3 text-sm text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
                max={toDate || undefined}
                onChange={(event) => setFromDate(event.target.value)}
                type="date"
                value={fromDate}
              />
            </div>
            <div className="min-w-0">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">To</p>
              <input
                className="flex h-9 w-full rounded-lg border border-[var(--panel-border)] bg-[var(--panel)] px-3 text-sm text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
                min={fromDate || undefined}
                onChange={(event) => setToDate(event.target.value)}
                type="date"
                value={toDate}
              />
            </div>
          </div>
        </div>
        {selectedEmployee ? (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] px-4 py-2.5 text-xs">
            <span
              className={`inline-flex items-center gap-1.5 font-semibold ${agentStatus?.online ? "text-emerald-600" : "text-slate-500"}`}
            >
              <Circle className={`h-2 w-2 ${agentStatus?.online ? "fill-emerald-500 text-emerald-500" : "fill-slate-400 text-slate-400"}`} />
              Monitoring Agent: {agentStatus?.online ? "Online" : "Offline"}
            </span>
            <span className="text-[var(--muted-foreground)]">
              {agentStatus
                ? `Last seen ${agentStatus.lastSeenLabel}${selectedEmployee.deviceLabel ? ` · ${selectedEmployee.deviceLabel}` : ""}`
                : "No heartbeat received from this employee's desktop app yet."}
            </span>
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-sm text-[var(--muted-foreground)]">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading screenshots...
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-sm text-rose-600">
            <AlertTriangle className="h-6 w-6" />
            {error}
            <Button className="mt-2" onClick={() => void loadFirstPage()} size="sm" variant="secondary">
              Try again
            </Button>
          </div>
        ) : screenshots.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-sm text-[var(--muted-foreground)]">
            <ImageOff className="h-6 w-6" />
            No screenshots for the selected filters yet.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {screenshots.map((shot) => (
                <button
                  className="group relative overflow-hidden rounded-xl border border-[var(--panel-border)] bg-[var(--panel-muted)] text-left transition hover:border-[var(--primary)]"
                  key={shot.id}
                  onClick={() => setLightboxId(shot.id)}
                  type="button"
                >
                  <div className="aspect-video w-full overflow-hidden bg-slate-900/5">
                    {/* eslint-disable-next-line @next/next/no-img-element -- authenticated bytes behind a private route; next/image's remote loader does not apply here */}
                    <img
                      alt={`Screenshot of ${shot.employeeName} at ${formatDateTimeInDhaka(shot.capturedAt)}`}
                      className="h-full w-full object-cover transition group-hover:scale-105"
                      loading="lazy"
                      src={shot.imageUrl}
                    />
                  </div>
                  <div className="space-y-0.5 p-2">
                    <p className="truncate text-xs font-semibold text-[var(--foreground)]">{shot.employeeName}</p>
                    <p className="truncate text-[0.68rem] text-[var(--muted-foreground)]">{formatDateTimeInDhaka(shot.capturedAt)}</p>
                  </div>
                </button>
              ))}
            </div>
            {nextCursor ? (
              <div className="mt-4 flex justify-center">
                <Button disabled={loadingMore} onClick={() => void loadMore()} variant="secondary">
                  {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {loadingMore ? "Loading..." : "Load more"}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </CardContent>

      <Dialog.Root onOpenChange={(open) => !open && setLightboxId(null)} open={Boolean(activeShot)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[min(1000px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_60px_rgba(0,0,0,0.25)] outline-none">
            {activeShot ? (
              <>
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{activeShot.employeeName}</p>
                    <p className="flex items-center gap-1.5 truncate text-xs text-slate-500">
                      <Camera className="h-3.5 w-3.5 shrink-0" />
                      {formatDateTimeInDhaka(activeShot.capturedAt)}
                      {activeShot.device ? (
                        <span className="flex items-center gap-1">
                          <MonitorSmartphone className="h-3.5 w-3.5 shrink-0" />
                          {activeShot.device.label}
                        </span>
                      ) : null}
                      <span>{activeShot.width}×{activeShot.height}</span>
                      <span>{formatFileSize(activeShot.fileSize)}</span>
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {isAdmin ? (
                      <button
                        aria-label="Delete screenshot"
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-60"
                        disabled={deletingId === activeShot.id}
                        onClick={() => void handleDelete(activeShot.id)}
                        type="button"
                      >
                        {deletingId === activeShot.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        Delete
                      </button>
                    ) : null}
                    <Dialog.Close asChild>
                      <button
                        aria-label="Close screenshot preview"
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                        type="button"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </Dialog.Close>
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-auto bg-slate-950/5 p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt={`Full screenshot of ${activeShot.employeeName}`} className="mx-auto max-w-full rounded-lg" src={activeShot.imageUrl} />
                </div>
              </>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </Card>
  );
}
