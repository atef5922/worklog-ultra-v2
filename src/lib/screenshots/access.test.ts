import { UserRole } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  canDeleteScreenshots,
  canViewScreenshot,
  canViewScreenshotsOfUser,
  resolveScreenshotScope,
  screenshotScopeFilter,
} from "@/lib/screenshots/access";

const TEAM_A = "11111111-1111-1111-1111-111111111111";
const TEAM_B = "22222222-2222-2222-2222-222222222222";

const employee = { id: "emp-1", role: UserRole.employee, departmentId: TEAM_A };
const teamHeadA = { id: "mgr-a", role: UserRole.manager, departmentId: TEAM_A };
const teamHeadB = { id: "mgr-b", role: UserRole.manager, departmentId: TEAM_B };
const admin = { id: "admin-1", role: UserRole.admin, departmentId: null };
const hr = { id: "hr-1", role: UserRole.hr, departmentId: TEAM_B };

describe("resolveScreenshotScope", () => {
  it("gives admin and hr organisation-wide scope", () => {
    expect(resolveScreenshotScope(admin)).toEqual({ kind: "all" });
    expect(resolveScreenshotScope(hr)).toEqual({ kind: "all" });
  });

  it("scopes a team head to its own department", () => {
    expect(resolveScreenshotScope(teamHeadA)).toEqual({ kind: "department", departmentId: TEAM_A });
  });

  it("scopes an employee to itself", () => {
    expect(resolveScreenshotScope(employee)).toEqual({ kind: "self", userId: "emp-1" });
  });

  it("fails closed for a manager with no department instead of widening to all", () => {
    const orphanManager = { id: "mgr-x", role: UserRole.manager, departmentId: null };
    expect(resolveScreenshotScope(orphanManager)).toEqual({ kind: "self", userId: "mgr-x" });
  });
});

describe("screenshotScopeFilter", () => {
  it("returns an unmatchable predicate for `none` rather than an empty object", () => {
    // An empty object would widen to "every screenshot" when spread into a
    // Prisma where clause — the fail-open shape this guards against.
    expect(screenshotScopeFilter({ kind: "none" })).not.toEqual({});
  });

  it("filters by department for a team head", () => {
    expect(screenshotScopeFilter(resolveScreenshotScope(teamHeadA))).toEqual({ departmentId: TEAM_A });
  });

  it("filters by user for an employee", () => {
    expect(screenshotScopeFilter(resolveScreenshotScope(employee))).toEqual({ userId: "emp-1" });
  });
});

describe("canViewScreenshot", () => {
  const shotTeamA = { userId: "emp-1", departmentId: TEAM_A };
  const shotTeamB = { userId: "emp-2", departmentId: TEAM_B };

  it("lets a team head read a screenshot from its own team", () => {
    expect(canViewScreenshot(teamHeadA, shotTeamA)).toBe(true);
  });

  it("blocks a team head from another team's screenshot", () => {
    // Scenario F from the brief.
    expect(canViewScreenshot(teamHeadA, shotTeamB)).toBe(false);
    expect(canViewScreenshot(teamHeadB, shotTeamA)).toBe(false);
  });

  it("lets an employee read only its own screenshot", () => {
    expect(canViewScreenshot(employee, shotTeamA)).toBe(true);
    expect(canViewScreenshot(employee, { userId: "emp-9", departmentId: TEAM_A })).toBe(false);
  });

  it("lets admin read anything", () => {
    expect(canViewScreenshot(admin, shotTeamA)).toBe(true);
    expect(canViewScreenshot(admin, shotTeamB)).toBe(true);
  });

  it("blocks a screenshot whose department is null from department-scoped viewers", () => {
    expect(canViewScreenshot(teamHeadA, { userId: "emp-3", departmentId: null })).toBe(false);
  });
});

describe("canViewScreenshotsOfUser", () => {
  it("blocks the ?userId= IDOR across teams", () => {
    expect(canViewScreenshotsOfUser(teamHeadA, { id: "emp-2", departmentId: TEAM_B })).toBe(false);
  });

  it("allows a team head to target an employee in its own team", () => {
    expect(canViewScreenshotsOfUser(teamHeadA, { id: "emp-1", departmentId: TEAM_A })).toBe(true);
  });

  it("blocks an employee from targeting a colleague in the same team", () => {
    expect(canViewScreenshotsOfUser(employee, { id: "emp-2", departmentId: TEAM_A })).toBe(false);
  });
});

describe("canDeleteScreenshots", () => {
  it("is admin-only", () => {
    expect(canDeleteScreenshots(admin)).toBe(true);
    expect(canDeleteScreenshots(hr)).toBe(false);
    expect(canDeleteScreenshots(teamHeadA)).toBe(false);
    expect(canDeleteScreenshots(employee)).toBe(false);
  });
});
