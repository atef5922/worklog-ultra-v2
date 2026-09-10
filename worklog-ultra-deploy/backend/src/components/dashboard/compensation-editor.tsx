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
}: {
  userId: string;
  userName: string;
  monthlySalary: number;
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
    <div className="min-w-[180px] space-y-2 rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-3">
      <div className="space-y-2">
        <Input
          className="min-w-0 bg-[var(--panel)]"
          inputMode="decimal"
          onChange={(event) => setSalary(event.target.value)}
          placeholder="Monthly salary (BDT)"
          value={salary}
        />
        <Button className="button-force-white w-full bg-[#4f5ef7] text-white hover:bg-[#4453eb]" disabled={saving} onClick={save} type="button">
          {saving ? "Saving..." : "Save Pay"}
        </Button>
      </div>
      <p className="text-xs text-[var(--muted-foreground)]">Team Head/Admin can set or update salary here. Team value analytics will recalculate from this amount.</p>
    </div>
  );
}
