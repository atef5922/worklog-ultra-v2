import {describe,expect,it} from "vitest";
import {auditActionLabel,auditActionSummary,formatAuditEvidence} from "./audit-log";

describe("audit log presentation",()=>{
  it("uses readable labels for technical action names",()=>{
    expect(auditActionLabel("attendance.auto_reconciled")).toBe("Attendance automatically corrected");
    expect(auditActionLabel("future.secure_action")).toBe("Future Secure Action");
  });
  it("summarizes a protected change without exposing raw evidence",()=>{
    expect(auditActionSummary("access.updated","Employee One")).toBe("Role, permission or access scope was changed for Employee One.");
  });
  it("keeps raw evidence available for the expanded read-only view",()=>{
    expect(formatAuditEvidence({role:"employee"})).toContain('"role": "employee"');
    expect(formatAuditEvidence(null)).toBe("No previous value");
  });
});
