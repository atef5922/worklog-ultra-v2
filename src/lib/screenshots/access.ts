import { UserRole } from "@prisma/client";



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


export function resolveScreenshotScope(viewer: ScreenshotViewer): ScreenshotScope {
  // Screenshot monitoring is not part of the delegated management release.
  // Preserve the owner's archive and Super Admin access; role names confer no new grant.
  if (viewer.role === UserRole.super_admin) return { kind: "all" };
  return { kind: "self", userId: viewer.id };
}


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


export function canDeleteScreenshots(viewer: ScreenshotViewer) {
  return viewer.role === UserRole.super_admin;
}
