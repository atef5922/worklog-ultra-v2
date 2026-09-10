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
  expectedDailyHours: number;
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
    const response = await fetch(`/api/dashboard/users/${userId}/compensation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        monthlySalary: salary,
      }),
    });
    const raw = await response.text();
    const result = raw ? JSON.parse(raw) : { message: "Compensation update failed." };
    setSaving(false);

    if (!response.ok) {
      toast.error(result.message);
      return;
    }

    toast.success(result.message ?? `${userName}'s compensation saved.`);
    router.refresh();
  }

  return (
    <div className="space-y-2 rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-3">
      <div className="grid gap-2 md:grid-cols-[1fr_auto]">
        <Input
          inputMode="decimal"
          onChange={(event) => setSalary(event.target.value)}
          placeholder="Monthly salary"
          value={salary}
        />
        <Button className="button-force-white bg-[#4f5ef7] text-white hover:bg-[#4453eb]" disabled={saving} onClick={save} type="button">
          {saving ? "Saving..." : "Save Pay"}
        </Button>
      </div>
      <p className="text-xs text-[var(--muted-foreground)]">Team Head/Admin can set employee salary from here for value analytics.</p>
    </div>
  );
}
