import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  overview: vi.fn(),
  attendanceExportResponse: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("@/lib/auth/server", () => ({ getServerAuthContext: mocks.auth }));
vi.mock("@/lib/db", () => ({ db: { managementAuditLog: { create: mocks.audit } } }));
vi.mock("@/lib/management/attendance-overview", () => ({ attendanceOverview: mocks.overview }));
vi.mock("@/lib/management/attendance-report", () => ({ attendanceExportResponse: mocks.attendanceExportResponse }));

import { GET } from "./route";

const actor = {
  id: "11111111-1111-4111-8111-111111111111",
  role: "admin", isActive: true, managementEnabled: true,
  permissions: ["employees.view", "attendance.view", "reports.export"].map(permissionKey => ({ permissionKey, isGranted: true })),
  accessScopes: [{ scopeType: "departments", departmentId: "22222222-2222-4222-8222-222222222222" }],
};
const row = {
  date: "2026-09-18", employeeName: "Jane Doe", department: "IT", team: "A",
  dayKind: "off", status: "worked_off_day", firstIn: new Date("2026-09-18T04:00:00Z"),
  lastOut: new Date("2026-09-18T07:00:00Z"), countedMinutes: 180, activeMinutes: 180,
  breakMinutes: 0, outsideMinutes: 0, overtimeMinutes: 0, offDayWorkMinutes: 180,
  flags: ["worked_off_day"], dayReason: null,
};
const url = "http://localhost:3000/api/management/attendance/export?from=2026-09-18&to=2026-09-18&departmentId=22222222-2222-4222-8222-222222222222&format=xlsx";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: actor });
  mocks.overview.mockResolvedValue({
    from: "2026-09-18", to: "2026-09-18", rows: [row], total: 1,
    totals: { recorded: 1, checkedIn: 0, missing: 0, autoOut: 0, offDayWork: 1, countedMinutes: 180, overtimeMinutes: 0 },
  });
  mocks.attendanceExportResponse.mockResolvedValue(new Response("workbook"));
});

describe("attendance report export", () => {
  it("uses the same scoped filters as the page and audits the download", async () => {
    expect((await GET(new Request(url))).status).toBe(200);
    expect(mocks.overview.mock.calls[0][1].get("departmentId")).toBe("22222222-2222-4222-8222-222222222222");
    expect(mocks.attendanceExportResponse.mock.calls[0][0].data.rows[0].date).toBe("2026-09-18");
    expect(mocks.attendanceExportResponse.mock.calls[0][0].params.get("departmentId")).toBe("22222222-2222-4222-8222-222222222222");
    expect(mocks.audit.mock.calls[0][0].data.afterValue.rows).toBe(1);
  });

  it("does not apply investigative status filters to monthly attendance percentages", async () => {
    const filtered = url + "&status=checked_in&attention=late&detail=1";
    expect((await GET(new Request(filtered))).status).toBe(200);
    const params = mocks.overview.mock.calls[0][1] as URLSearchParams;
    expect(params.get("departmentId")).toBe("22222222-2222-4222-8222-222222222222");
    expect(params.get("status")).toBeNull();
    expect(params.get("attention")).toBeNull();
    expect(params.get("detail")).toBe("1");
  });

  it("rejects export without both attendance and export grants", async () => {
    mocks.auth.mockResolvedValue({ user: { ...actor, permissions: actor.permissions.filter(item => item.permissionKey !== "attendance.view") } });
    expect((await GET(new Request(url))).status).toBe(403);
    expect(mocks.overview).not.toHaveBeenCalled();
  });

  it("does not silently turn an unknown format into Excel", async () => {
    expect((await GET(new Request(url.replace("format=xlsx", "format=csv")))).status).toBe(400);
    expect(mocks.attendanceExportResponse).not.toHaveBeenCalled();
  });
});
