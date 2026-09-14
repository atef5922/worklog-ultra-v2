import React from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { AttendanceCorrection } from "../../src/components/management/attendance-correction";
import { AttendancePanel } from "../../src/components/dashboard/attendance-panel";
import { calculateSegmentedAttendanceMetrics } from "../../src/lib/attendance-policy";
import { ATTENDANCE_STARTED_EVENT, ATTENDANCE_STOPPED_EVENT } from "../../src/lib/dashboard-live-events";
import { toDateOnly } from "../../src/lib/utils";

// Isolated synthetic transport, shared only between this test origin's browser tabs. No real API or DB.
type Session = { id: string; startedAt: string; endedAt: string | null; endReason: string | null };
type Row = { attendanceDate: string; revision: string; workSessions: Session[]; breakSessions: Session[] };
type Database = { now: string; serial: number; rows: Row[] };
type Harness = { failNext: string | null; requests: Array<{ method: string; body?: Record<string, unknown> }>;
  events: string[]; setAccount: (userId: string) => void; setNow: (time: string) => void; read: () => Database };
declare global { interface Window { attendanceTest: Harness } }
const key = "synthetic-attendance-database";
const read = (): Database => JSON.parse(localStorage.getItem(key) ?? '{"now":"2026-09-14T10:00:00+06:00","serial":0,"rows":[]}');
const write = (state: Database) => localStorage.setItem(key, JSON.stringify(state));
window.attendanceTest = { failNext: null, requests: [], events: [], read,
  setAccount(userId) { localStorage.setItem("synthetic-attendance-account", userId); },
  setNow(time) { const db = read(); db.now = time; write(db); } };
window.addEventListener(ATTENDANCE_STARTED_EVENT, () => window.attendanceTest.events.push("in"));
window.addEventListener(ATTENDANCE_STOPPED_EVENT, () => window.attendanceTest.events.push("out"));
const serialize = (row: Row, now: string) => {
  const work = row.workSessions.find(s => !s.endedAt), activeBreak = row.breakSessions.find(s => !s.endedAt);
  return { ...row, status: "present", note: "", legacyBreakMinutes: 0,
    checkInAt: row.workSessions[0]?.startedAt ?? null, checkOutAt: work ? null : row.workSessions.at(-1)?.endedAt ?? null,
    active: Boolean(work), onBreak: Boolean(activeBreak), currentSessionStartedAt: work?.startedAt ?? null,
    currentBreakStartedAt: activeBreak?.startedAt ?? null,
    ...calculateSegmentedAttendanceMetrics({ ...row, now: new Date(now) }) };
};
window.fetch = async (url, options = {}) => {
  const method = options.method ?? "GET", body = options.body ? JSON.parse(String(options.body)) : undefined;
  window.attendanceTest.requests.push({ method, body });
  const failure = method !== "GET" ? window.attendanceTest.failNext : null;
  if (method !== "GET") window.attendanceTest.failNext = null;
  await new Promise(resolve => setTimeout(resolve, 120));
  if (failure === "http") return Response.json({ success: false, message: "Synthetic attendance conflict" }, { status: 409 });
  if (failure === "network") throw new TypeError("Synthetic network failure");
  if (failure === "html") return new Response("<html>Sign in</html>");
  if (String(url) === "/api/management/attendance") {
    if (!body.closeOpenSessions || body.expectedRevision !== "a".repeat(64)) return Response.json({message:"Unconfirmed correction"}, {status:409});
    return Response.json({message:"Attendance corrected.",record:{id:body.recordId},revision:"b".repeat(64)});
  }
  const userId = localStorage.getItem("synthetic-attendance-account") ?? "employee-test";
  if (method === "POST" && body.expectedUserId !== userId) return Response.json({success:false,message:"Your session changed. Please sign in again."},{status:409});
  const db = read(), today = toDateOnly(new Date(db.now));
  let row = method === "GET"
    ? db.rows.find(r => r.workSessions.some(s => !s.endedAt)) ?? db.rows.find(r => r.attendanceDate === today)
    : db.rows.find(r => r.attendanceDate === body.attendanceDate);
  if (method === "POST") {
    if ((row?.revision ?? null) !== body.expectedRevision) return Response.json({ success: false, message: "Synthetic attendance conflict" }, { status: 409 });
    if (!row) { row = { attendanceDate: body.attendanceDate, revision: "0".repeat(64), workSessions: [], breakSessions: [] }; db.rows.push(row); }
    const work = row.workSessions.find(s => !s.endedAt), rest = row.breakSessions.find(s => !s.endedAt);
    const session = (): Session => ({ id: `session-${++db.serial}`, startedAt: new Date(db.now).toISOString(), endedAt: null, endReason: null });
    if (body.action === "check_in") row.workSessions.push(session());
    if (body.action === "break_start") row.breakSessions.push(session());
    if ((body.action === "break_end" || body.action === "check_out") && rest) { rest.endedAt = new Date(db.now).toISOString(); rest.endReason = "manual"; }
    if (body.action === "check_out" && work) { work.endedAt = new Date(db.now).toISOString(); work.endReason = "manual"; }
    row.revision = (++db.serial).toString(16).padStart(64, "0"); write(db);
    if (failure === "lost") throw new TypeError("Synthetic response lost after commit");
  }
  return Response.json({ success: true, userId, serverNow: new Date(db.now).toISOString(), message: "Attendance saved",
    snapshot: row ? serialize(row, db.now) : null });
};
createRoot(document.getElementById("root")!).render(<>
  {location.pathname === "/correction" ? <AttendanceCorrection record={{
    id:"11111111-1111-4111-8111-111111111111",revision:"a".repeat(64),updatedAt:"2026-09-14T05:00:00.000Z",legacyBreakMinutes:0,
    workSessions:[
      {id:"22222222-2222-4222-8222-222222222222",startedAt:"2026-09-14T04:00:43.127Z",endedAt:null},
      {id:"33333333-3333-4333-8333-333333333333",startedAt:"2026-09-14T05:00:00.000Z",endedAt:null},
    ],breakSessions:[]
  }}/> : <AttendancePanel currentUserId="employee-test" userRole="employee" items={[{ userId: "employee-test", name: "Test Employee", email: "test@example.invalid", role: "employee", departmentName: "Test", attendance: null }]} />}
  <Toaster />
</>);
