import { UserRole } from "@prisma/client";

/**
 * Who may look at whose screenshots.
 *
 * This module is deliberately pure: it takes a viewer and returns a Prisma
 * `where` fragment, so authorisation is decided in one place instead of being
 * re-derived (and eventually re-derived *wrongly*) in each route handler. Route
 * handlers must build every screenshot query on top of `screenshotScopeFilter`
 * and never accept a caller-supplied filter as the whole `where`.
 *
 * Scope note: this deployment is single-tenant — one install is one
 * organisation — so there is no organisation column to compare. Department is
 * the team boundary. If multi-tenancy is ever added, the organisation predicate
 * belongs here and nowhere else.
 */

export type ScreenshotViewer = {
  id: string;
  role: UserRole;
  departmentId?: string | null;
};

export type ScreenshotScope =
  | { kind: "all" }
  | { kind: "department"; departmentId: string }
  | { kind: "self"; userId: string }
  | { kind: "none" };

/**
 * `admin` and `hr` see the whole organisation; `manager` is the team-head role
 * and sees only its own department; everyone else sees only themselves.
 *
 * A manager with no department is intentionally scoped to `self` rather than
 * `all` — an unset department must never fail open into org-wide access.
 */
export function resolveScreenshotScope(viewer: ScreenshotViewer): ScreenshotScope {
  if (viewer.role === UserRole.admin || viewer.role === UserRole.hr) {
    return { kind: "all" };
  }

  if (viewer.role === UserRole.manager) {
    return viewer.departmentId
      ? { kind: "department", departmentId: viewer.departmentId }
      : { kind: "self", userId: viewer.id };
  }

  return { kind: "self", userId: viewer.id };
}

/**
 * The scope expressed as a Prisma `where` fragment.
 *
 * `{ kind: "none" }` returns a predicate that cannot match rather than an empty
 * object, because an empty object would silently widen to "everything" when
 * spread into a query — the classic fail-open shape this avoids.
 */
export function screenshotScopeFilter(scope: ScreenshotScope) {
  switch (scope.kind) {
    case "all":
      return {};
    case "department":
      return { departmentId: scope.departmentId };
    case "self":
      return { userId: scope.userId };
    case "none":
      return { id: "00000000-0000-0000-0000-000000000000" };
  }
}

/**
 * Whether a viewer may read one already-loaded screenshot.
 *
 * Used after a lookup by id, where a scope filter alone would let the caller
 * distinguish "not found" from "forbidden". Both cases return 404 in the route
 * so an unauthorised caller learns nothing about which ids exist.
 */
export function canViewScreenshot(
  viewer: ScreenshotViewer,
  screenshot: { userId: string; departmentId: string | null },
) {
  const scope = resolveScreenshotScope(viewer);

  switch (scope.kind) {
    case "all":
      return true;
    case "department":
      return screenshot.departmentId === scope.departmentId;
    case "self":
      return screenshot.userId === scope.userId;
    case "none":
      return false;
  }
}

/**
 * Whether a viewer may request another employee's screenshots by user id.
 *
 * This is the IDOR guard for `?userId=`: without it, a team head could read any
 * employee's captures simply by editing the query string.
 */
export function canViewScreenshotsOfUser(
  viewer: ScreenshotViewer,
  target: { id: string; departmentId: string | null },
) {
  const scope = resolveScreenshotScope(viewer);

  switch (scope.kind) {
    case "all":
      return true;
    case "department":
      return target.departmentId === scope.departmentId;
    case "self":
      return target.id === scope.userId;
    case "none":
      return false;
  }
}

/** Only privileged roles may delete monitoring evidence. */
export function canDeleteScreenshots(viewer: ScreenshotViewer) {
  return viewer.role === UserRole.admin;
}
