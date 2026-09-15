export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "access.updated": "Access settings updated",
  "attendance.auto_reconciled": "Attendance automatically corrected",
  "attendance.corrected": "Attendance manually corrected",
  "department.created": "Department created",
  "department.deleted": "Department deleted",
  "employee.profile_updated": "Employee profile updated",
  "employee.status.updated": "Employee account status updated",
  "legacy_access_migrated": "Legacy access migrated",
  "notice.published": "Notice published",
  "task.assigned": "Task assigned",
  "task.planning_updated": "Task plan updated",
  "task.reopened": "Task reopened",
  "task.updated": "Task details updated",
  "team.saved": "Team settings updated",
};

export function auditActionLabel(action: string) {
  return AUDIT_ACTION_LABELS[action] ?? action
    .replaceAll("_", " ")
    .replaceAll(".", " ")
    .replace(/\b\w/g, character => character.toUpperCase());
}

export function auditActionSummary(action: string, targetName: string) {
  const summaries: Record<string, string> = {
    "access.updated": `Role, permission or access scope was changed for ${targetName}.`,
    "attendance.auto_reconciled": `An older open attendance session for ${targetName} was closed at the next recorded office entry.`,
    "attendance.corrected": `An authorized reviewer corrected attendance evidence for ${targetName}.`,
    "department.created": "A new department was added to the company structure.",
    "department.deleted": "A department was removed from the company structure.",
    "employee.profile_updated": `Profile information was changed for ${targetName}.`,
    "employee.status.updated": `Account availability was changed for ${targetName}.`,
    "legacy_access_migrated": `Legacy access settings were migrated for ${targetName}.`,
    "notice.published": "A company or department notice was published.",
    "task.assigned": `A task was assigned to ${targetName}.`,
    "task.planning_updated": `Planning information was changed for a task owned by ${targetName}.`,
    "task.reopened": `A completed task owned by ${targetName} was reopened.`,
    "task.updated": `Task details were changed for ${targetName}.`,
    "team.saved": `Team membership or leadership settings were updated for ${targetName}.`,
  };
  return summaries[action] ?? `A protected record affecting ${targetName} was changed.`;
}

export function formatAuditEvidence(value: unknown) {
  if (value === null || typeof value === "undefined") return "No previous value";
  return JSON.stringify(value, null, 2);
}
