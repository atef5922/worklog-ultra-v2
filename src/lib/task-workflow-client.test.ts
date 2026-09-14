import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { completePersonalTask, reopenPersonalTask, requestTaskJson, savePersonalTimer, timerAtSave } from "./task-workflow-client";
import { readTaskTimerSnapshot, writeTaskTimerSnapshot } from "./task-timer-storage";

const taskId = "11111111-1111-4111-8111-111111111111";
const day = "2026-09-14";
const cache = new Map<string, string>();
const fetchMock = vi.fn();
const snapshot = { status: "in_progress" as const, trackedMinutes: "2", trackedSeconds: "120",
  actualStart: "2026-09-14T04:00:00.000Z", actualEnd: "", runningStartedAt: "2026-09-14T05:59:30.000Z" };
const done = { reportDate: day, status: "done", trackedMinutes: 3,
  actualStart: snapshot.actualStart, actualEnd: "2026-09-14T06:00:00.000Z", note: "Reviewed" };
beforeEach(() => {
  cache.clear(); fetchMock.mockReset(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-14T06:00:00.000Z"));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("window", { localStorage: { getItem: (key: string) => cache.get(key) ?? null,
    setItem: (key: string, value: string) => cache.set(key, value), removeItem: (key: string) => cache.delete(key) } });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const respond = (body: unknown, status = 200) => fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify(body), { status })));

describe("shared task workflow", () => {
  it("blocks overlapping writes for the same task and releases the lock after success", async () => {
    let release!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { release = resolve; }));
    const pending = savePersonalTimer(taskId, day, snapshot);
    await expect(completePersonalTask(taskId, "Reviewed", snapshot)).rejects.toThrow("already being saved");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    release(Response.json({ message: "Saved" }));
    await pending;
    respond({ message: "Completed", taskUpdate: done });
    await expect(completePersonalTask(taskId, "Reviewed", snapshot)).resolves.toMatchObject({ update: done });
  });
  it("allows independent tasks to save concurrently", async () => {
    respond({ message: "Saved" });
    await Promise.all([savePersonalTimer(taskId, day, snapshot), savePersonalTimer("other-task", day, snapshot)]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("banks only the current running segment", () => {
    expect(timerAtSave(snapshot).trackedSeconds).toBe("150");
    expect(timerAtSave({ ...snapshot, runningStartedAt: "" }).trackedSeconds).toBe("120");
  });
  it("does not double-count a live UI sample", () => {
    expect(timerAtSave({ ...snapshot, trackedSeconds: "149", sampledAt: Date.now() - 1000 }).trackedSeconds).toBe("150");
  });
  it("sends only timer progress, not completion, through the report endpoint", async () => {
    respond({ message: "Saved" }); await savePersonalTimer(taskId, day, snapshot);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.updates[0]).toMatchObject({ status: "in_progress", trackedMinutes: 2 });
    expect(body.updates[0]).not.toHaveProperty("note");
    expect(cache.size).toBe(0);
  });
  it("rejects accidental report-based Done before a request", async () => {
    await expect(savePersonalTimer(taskId, day, { ...snapshot, status: "done" })).rejects.toThrow("Use Done");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("does not stop or complete the cached timer on an API error", async () => {
    writeTaskTimerSnapshot(day, taskId, snapshot); respond({ message: "Checklist incomplete" }, 409);
    await expect(completePersonalTask(taskId, "Keep my note", snapshot)).rejects.toThrow("Checklist incomplete");
    expect(readTaskTimerSnapshot(day, taskId)).toMatchObject(snapshot);
  });
  it("keeps state unchanged after a network failure and permits retry", async () => {
    writeTaskTimerSnapshot(day, taskId, snapshot); fetchMock.mockRejectedValueOnce(new TypeError("Network unavailable"));
    await expect(completePersonalTask(taskId, "Reviewed", snapshot)).rejects.toThrow();
    expect(readTaskTimerSnapshot(day, taskId)?.status).toBe("in_progress");
    respond({ message: "Completed", taskUpdate: done });
    await completePersonalTask(taskId, "Reviewed", snapshot);
    expect(readTaskTimerSnapshot(day, taskId)).toMatchObject({ status: "done", actualEnd: done.actualEnd, runningStartedAt: "" });
  });
  it.each(["", "<html>Login</html>", "null", "{}"])("does not accept a misleading HTTP 200 body: %s", async body => {
    fetchMock.mockResolvedValue(new Response(body));
    await expect(requestTaskJson("/api/example", { method: "POST" })).rejects.toThrow();
  });
  it("requires confirmed task data before updating cached completion", async () => {
    respond({ message: "Completed" });
    await expect(completePersonalTask(taskId, "Reviewed", snapshot)).rejects.toThrow("could not be confirmed");
    expect(cache.size).toBe(0);
  });
  it("uses the server end time and saved minutes after completion", async () => {
    respond({ message: "Completed", taskUpdate: done });
    const result = await completePersonalTask(taskId, "Reviewed", snapshot);
    expect(result.update).toEqual(done);
    expect(readTaskTimerSnapshot(day, taskId)).toMatchObject({ trackedMinutes: "3", actualEnd: done.actualEnd });
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent).toMatchObject({ action: "complete_task", completionStatus: "done", completionNote: "Reviewed", trackedMinutes: 2 });
    expect(sent).not.toHaveProperty("needFollowUp");
  });
  it("clears stale Done after a successful reason-required reopen", async () => {
    writeTaskTimerSnapshot(day, taskId, { ...snapshot, status: "done", runningStartedAt: "" });
    respond({ message: "Reopened", taskUpdate: { ...done, status: "in_progress", note: "Reopened: Testing required" } });
    await reopenPersonalTask(taskId, "Testing required");
    expect(readTaskTimerSnapshot(day, taskId)).toMatchObject({ status: "in_progress", actualEnd: done.actualEnd, runningStartedAt: "" });
  });
  it("does not clear completion when reopen fails", async () => {
    writeTaskTimerSnapshot(day, taskId, { ...snapshot, status: "done", runningStartedAt: "" });
    respond({ message: "Reopen denied" }, 403);
    await expect(reopenPersonalTask(taskId, "Testing required")).rejects.toThrow("Reopen denied");
    expect(readTaskTimerSnapshot(day, taskId)?.status).toBe("done");
  });
  it("does not turn an acknowledged save into failure when browser storage is blocked", async () => {
    vi.stubGlobal("window", { get localStorage() { throw new Error("Storage disabled"); } });
    respond({ message: "Completed", taskUpdate: done });
    await expect(completePersonalTask(taskId, "Reviewed", snapshot)).resolves.toMatchObject({ update: done });
    expect(readTaskTimerSnapshot(day, taskId)).toBeNull();
  });
});
