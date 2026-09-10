"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { EXTRA_ACCESS_OPTIONS, type ExtraAccessKey } from "@/lib/auth/permissions";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type DepartmentOption = {
  id: string;
  name: string;
};

const ROLE_OPTIONS = [
  { value: "employee", label: "Employee" },
  { value: "hr", label: "HR" },
  { value: "manager", label: "Team Head" },
  { value: "admin", label: "CEO / Admin" },
] as const;

export function UserRoleDepartmentEditor({
  userId,
  userName,
  initialRole,
  initialDepartmentId,
  initialExtraAccess = [],
  departments,
  disabled = false,
  allowRoleEdit = true,
  allowAccessEdit = false,
  accessOptions = EXTRA_ACCESS_OPTIONS,
  compact = false,
  layout = "stacked",
}: {
  userId: string;
  userName: string;
  initialRole: "employee" | "hr" | "manager" | "admin";
  initialDepartmentId?: string | null;
  initialExtraAccess?: string[];
  departments: DepartmentOption[];
  disabled?: boolean;
  allowRoleEdit?: boolean;
  allowAccessEdit?: boolean;
  accessOptions?: ReadonlyArray<{ key: ExtraAccessKey; label: string }>;
  compact?: boolean;
  layout?: "stacked" | "inline";
}) {
  const router = useRouter();
  const [role, setRole] = useState(initialRole);
  const [departmentId, setDepartmentId] = useState(initialDepartmentId ?? "none");
  const [extraAccess, setExtraAccess] = useState<ExtraAccessKey[]>(initialExtraAccess as ExtraAccessKey[]);
  const [saving, setSaving] = useState(false);

  const hasChanges = useMemo(
    () =>
      role !== initialRole ||
      departmentId !== (initialDepartmentId ?? "none") ||
      extraAccess.join("|") !== initialExtraAccess.join("|"),
    [departmentId, extraAccess, initialDepartmentId, initialExtraAccess, initialRole, role],
  );

  function toggleAccess(key: ExtraAccessKey) {
    setExtraAccess((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  }

  async function saveChanges() {
    setSaving(true);
    try {
      const response = await fetch(`/api/dashboard/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          departmentId: departmentId === "none" ? null : departmentId,
          extraAccess,
        }),
      });
      const raw = await response.text();
      const result = raw ? JSON.parse(raw) : { message: "User update failed." };
      setSaving(false);

      if (!response.ok) {
        toast.error(result.message ?? "User update failed.");
        return;
      }

      toast.success(result.message ?? `${userName} updated successfully.`);
      router.refresh();
    } catch (error) {
      setSaving(false);
      toast.error(error instanceof Error ? error.message : "User update failed.");
    }
  }

  return (
    <div className={`flex ${compact ? "min-w-[220px] gap-1.5" : "min-w-[320px] gap-2"} flex-col`}>
      <div className={`flex flex-wrap items-center ${compact ? "gap-1.5" : "gap-2"} ${layout === "inline" ? "justify-end" : ""}`}>
      <Select disabled={disabled || saving || !allowRoleEdit} onValueChange={(value) => setRole(value as typeof initialRole)} value={role}>
        <SelectTrigger className={`${compact ? "h-8 w-[118px] text-xs" : "h-9 w-[140px]"}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROLE_OPTIONS.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select disabled={disabled || saving} onValueChange={setDepartmentId} value={departmentId}>
        <SelectTrigger className={`${compact ? "h-8 w-[138px] text-xs" : "h-9 w-[170px]"}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Executive / No Dept</SelectItem>
          {departments.map((department) => (
            <SelectItem key={department.id} value={department.id}>
              {department.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button className={compact ? "h-8 px-3 text-xs" : ""} disabled={disabled || saving || !hasChanges} onClick={saveChanges} size="sm" type="button">
        {saving ? "Saving..." : "Update"}
      </Button>
      </div>
      {allowAccessEdit ? (
        <div className={`flex flex-wrap ${compact ? "gap-1.5" : "gap-2"} ${layout === "inline" ? "justify-end" : ""}`}>
          {accessOptions.map((item) => {
            const checked = extraAccess.includes(item.key);

            return (
              <label
                className={`inline-flex cursor-pointer items-center ${compact ? "gap-1.5 px-2.5 py-1 text-[11px]" : "gap-2 px-3 py-1.5 text-xs"} rounded-full border font-medium ${
                  checked
                    ? "border-[#4f5ef7] bg-[#eef2ff] text-[#3148d8]"
                    : "border-[var(--panel-border)] bg-white text-[var(--muted-foreground)]"
                }`}
                key={item.key}
              >
                <input
                  checked={checked}
                  className={`${compact ? "h-3 w-3" : "h-3.5 w-3.5"}`}
                  disabled={disabled || saving}
                  onChange={() => toggleAccess(item.key)}
                  type="checkbox"
                />
                {item.label}
              </label>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
