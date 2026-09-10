"use client";

import { BriefcaseBusiness, Building2, Code2, Landmark, Megaphone, PackageCheck, Settings2, ShoppingBag, Trash2, Users2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Department = {
  id: string;
  name: string;
  memberCount: number;
  teamHeadCount: number;
};

function getDepartmentIcon(name: string) {
  const lowered = name.toLowerCase();

  if (lowered.includes("account") || lowered.includes("finance")) return Landmark;
  if (lowered.includes("e-commerce") || lowered.includes("sales")) return ShoppingBag;
  if (lowered.includes("hr")) return Users2;
  if (lowered.includes("it") || lowered.includes("technical") || lowered.includes("development")) return Code2;
  if (lowered.includes("operation")) return Settings2;
  if (lowered.includes("purchase") || lowered.includes("procurement")) return PackageCheck;
  if (lowered.includes("tender")) return BriefcaseBusiness;
  if (lowered.includes("marketing")) return Megaphone;
  return Building2;
}

export function DepartmentsManager({ departments = [] }: { departments: Department[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function addDepartment() {
    const trimmed = name.trim();

    if (!trimmed) {
      toast.error("Enter a department name first.");
      return;
    }

    setLoading(true);
    const response = await fetch("/api/dashboard/departments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    const result = await response.json();
    setLoading(false);

    if (!response.ok) {
      toast.error(result.message);
      return;
    }

    toast.success(result.message);
    setName("");
    router.refresh();
  }

  async function deleteDepartment(department: Department) {
    const confirmed = window.confirm(`Delete the "${department.name}" department?`);

    if (!confirmed) {
      return;
    }

    setDeletingId(department.id);
    const response = await fetch("/api/dashboard/departments", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: department.id }),
    });
    const result = await response.json();
    setDeletingId(null);

    if (!response.ok) {
      toast.error(result.message);
      return;
    }

    toast.success(result.message);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Add New Department</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 md:flex-row">
          <Input placeholder="Enter new department name" value={name} onChange={(event) => setName(event.target.value)} />
          <Button disabled={loading} onClick={addDepartment} type="button">
            {loading ? "Adding..." : "Add Department"}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Active Departments</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(departments ?? []).map((department) => (
            <div key={department.id} className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#e9f1ff] text-[#3156d3]">
                    {(() => {
                      const Icon = getDepartmentIcon(department.name);
                      return <Icon className="h-5 w-5" />;
                    })()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-[var(--foreground)]">{department.name}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-700">
                        Members: {department.memberCount}
                      </span>
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-700">
                        Team Heads: {department.teamHeadCount}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                      Shift people from Users &amp; Roles. Remove only if this department is no longer needed.
                    </p>
                  </div>
                </div>
                <Button
                  aria-label={`Delete ${department.name}`}
                  className="h-10 w-10 rounded-xl"
                  disabled={deletingId === department.id}
                  onClick={() => deleteDepartment(department)}
                  size="icon"
                  type="button"
                  variant="danger"
                >
                  <Trash2 className="h-5 w-5" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
