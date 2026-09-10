"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CompensationEditor({
  userId,
  userName,
  monthlySalary,
  compact = false,
  layout = "stacked",
}: {
  userId: string;
  userName: string;
  monthlySalary: number;
  compact?: boolean;
  layout?: "stacked" | "inline";
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [salary, setSalary] = useState(String(monthlySalary || ""));

  async function save() {
    if (!salary.trim()) {
      toast.error("Enter monthly salary first.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/dashboard/users/${userId}/compensation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthlySalary: salary,
        }),
      });
      const raw = await response.text();
      const result = (() => {
        if (!raw) {
          return { message: "Compensation update failed." };
        }

        try {
          return JSON.parse(raw) as { message?: string };
        } catch {
          return {
            message: response.ok
              ? "Salary saved, but server returned an unexpected response."
              : "Salary update failed. Please refresh and try again.",
          };
        }
      })();

      if (!response.ok) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message ?? `${userName}'s compensation saved.`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Salary update request failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={`${
        compact ? "min-w-[150px]" : "min-w-[180px]"
      } ${layout === "inline" ? "" : compact ? "space-y-1.5 rounded-xl p-2.5" : "space-y-2 rounded-2xl p-3"} ${
        layout === "inline" ? "border-0 bg-transparent p-0" : "border border-[var(--panel-border)] bg-[var(--panel-muted)]"
      }`}
    >
      <div className={`${layout === "inline" ? "flex flex-wrap items-center gap-2" : compact ? "space-y-1.5" : "space-y-2"}`}>
        <Input
          className={`min-w-0 bg-[var(--panel)] ${compact ? "h-9 text-sm" : ""} ${layout === "inline" ? "w-[120px]" : ""}`}
          inputMode="decimal"
          onChange={(event) => setSalary(event.target.value)}
          placeholder="Monthly salary (BDT)"
          value={salary}
        />
        <Button className={`button-force-white bg-[#4f5ef7] text-white hover:bg-[#4453eb] ${compact ? "h-9 text-sm" : ""} ${layout === "inline" ? "px-3" : "w-full"}`} disabled={saving} onClick={save} type="button">
          {saving ? "Saving..." : "Save Pay"}
        </Button>
      </div>
      {!compact ? <p className="text-xs text-[var(--muted-foreground)]">Team Head/Admin can set or update salary here. Team value analytics will recalculate from this amount.</p> : null}
    </div>
  );
}
