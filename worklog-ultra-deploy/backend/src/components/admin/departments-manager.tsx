"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Department = {
  id: string;
  name: string;
};

export function DepartmentsManager({ departments }: { departments: Department[] }) {
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
          {departments.map((department) => (
            <div key={department.id} className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-5 text-white">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-white">{department.name}</p>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                    Remove unused departments from here.
                  </p>
                </div>
                <Button
                  aria-label={`Delete ${department.name}`}
                  className="h-11 w-11 rounded-xl"
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
