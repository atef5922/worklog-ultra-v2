import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadAttendance, publishAttendance, saveAttendanceAction } from "./attendance-client";
import type { DashboardAttendanceSnapshot } from "./contracts/user";
import { ATTENDANCE_STARTED_EVENT, ATTENDANCE_STOPPED_EVENT } from "./dashboard-live-events";

const userId = "employee-test", now = new Date("2026-09-14T05:00:00.000Z"), fetchMock = vi.fn();
const snapshot: DashboardAttendanceSnapshot = {
  revision: "a".repeat(64), attendanceDate: "2026-09-14", cutoffExtendedUntil: null, status: "present", note: "", breakMinutes: 0, legacyBreakMinutes: 0,
  checkInAt: now.toISOString(), checkOutAt: null, active: true, onBreak: false,
  currentSessionStartedAt: now.toISOString(), currentBreakStartedAt: null,
  workSessions: [{ id: "work-session", startedAt: now.toISOString(), endedAt: null, endReason: null }], breakSessions: [],
};
const envelope = (value: DashboardAttendanceSnapshot | null = snapshot) => ({ success: true as const, userId, serverNow: now.toISOString(), message: "Saved", snapshot: value });
const respond = (value: unknown, status = 200) => fetchMock.mockImplementation(() => Promise.resolve(Response.json(value, { status })));
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => vi.unstubAllGlobals());

describe("attendance client confirmation", () => {
  it("binds a first In to the account displayed in the tab", async () => {
    respond(envelope()); await saveAttendanceAction(userId, "check_in", null, now);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).expectedUserId).toBe(userId);
  });
  it.each(["another-employee", undefined])("rejects a POST confirmation for an unexpected/missing account: %s", async responseUser => {
    respond({ ...envelope(), userId: responseUser });
    await expect(saveAttendanceAction(userId, "check_in", null, now)).rejects.toThrow(/session changed|confirmed/);
  });
  it("releases controls after a timed-out confirmation and does not blindly repeat the POST", async () => {
    fetchMock.mockRejectedValueOnce(new DOMException("Timed out", "TimeoutError"));
    await expect(saveAttendanceAction(userId, "check_in", null, now)).rejects.toThrow("confirmation timed out");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    respond(envelope());
    await expect(saveAttendanceAction(userId, "check_in", null, now)).resolves.toMatchObject({ snapshot });
  });

  it("sends the snapshot revision and no editable timestamps, status, note or owner", async () => {
    respond(envelope()); await saveAttendanceAction(userId, "check_in", null, now);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ action: "check_in", expectedUserId: userId, attendanceDate: "2026-09-14", expectedRevision: null, eventId: expect.any(String) });
  });
  it("In after an overnight Out targets the new day with no stale revision", async () => {
    respond(envelope()); await saveAttendanceAction(userId, "check_in", { ...snapshot, attendanceDate: "2026-09-13", active: false }, now);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ attendanceDate: "2026-09-14", expectedRevision: null });
  });
  it("Out targets the still-open attendance date rather than today's date", async () => {
    const old = { ...snapshot, attendanceDate: "2026-09-13" };
    respond(envelope({ ...old, active: false, checkOutAt: now.toISOString(), currentSessionStartedAt: null,
      workSessions: [{ ...old.workSessions[0], endedAt: now.toISOString() }] }));
    await saveAttendanceAction(userId, "check_out", old, now);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ attendanceDate: "2026-09-13", expectedRevision: old.revision, endReason: "manual" });
  });
  it.each(["", "<html>Login</html>", "null", "{}"])("rejects unconfirmed response %s", async value => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(value)));
    await expect(saveAttendanceAction(userId, "check_in", null, now)).rejects.toThrow(/confirmed/);
  });
  it("surfaces a conflict and does not automatically replay the action", async () => {
    respond({ message: "Attendance changed in another tab." }, 409);
    await expect(saveAttendanceAction(userId, "break_start", snapshot, now)).rejects.toThrow(/another tab/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("rejects an apparently successful response whose session state contradicts its flags", async () => {
    respond(envelope({ ...snapshot, active: false })); await expect(saveAttendanceAction(userId, "check_in", null, now)).rejects.toThrow(/confirmed/);
  });
  it("rejects a valid snapshot that does not confirm the requested action", async () => {
    respond(envelope()); await expect(saveAttendanceAction(userId, "check_out", snapshot, now)).rejects.toThrow(/requested attendance/);
  });
  it("requires the GET response to belong to the signed-in employee", async () => {
    respond({ ...envelope(), userId: "another-employee" }); await expect(loadAttendance(userId)).rejects.toThrow(/session changed/);
  });
  it("releases the save guard after failure and blocks double clicks before the first response", async () => {
    let release!: (value: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { release = resolve; }));
    const first = saveAttendanceAction(userId, "check_in", null, now);
    await expect(saveAttendanceAction(userId, "check_in", null, now)).rejects.toThrow(/already being saved/);
    release(Response.json({ message: "Rejected" }, { status: 409 })); await expect(first).rejects.toThrow("Rejected");
    respond(envelope()); await expect(saveAttendanceAction(userId, "check_in", null, now)).resolves.toMatchObject({ snapshot });
  });
  it("publishes attendance transitions only when confirmed state changes, even with blocked storage", () => {
    const target = new EventTarget(); const events: string[] = [];
    target.addEventListener(ATTENDANCE_STARTED_EVENT, () => events.push("started"));
    target.addEventListener(ATTENDANCE_STOPPED_EVENT, () => events.push("stopped"));
    vi.stubGlobal("window", Object.defineProperty(target, "localStorage", { get() { throw new Error("Disabled"); } }));
    publishAttendance(userId, envelope(), null); publishAttendance(userId, envelope(), snapshot); publishAttendance(userId, envelope(null), snapshot);
    expect(events).toEqual(["started", "stopped"]);
  });
});
