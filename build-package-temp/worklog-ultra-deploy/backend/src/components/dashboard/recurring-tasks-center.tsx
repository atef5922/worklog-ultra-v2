"use client";

import { Plus, Repeat2, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  OTHER_DEPARTMENT_ID,
  appendRecurringTemplateToTodayPlan,
  deleteRecurringTemplate,
  describeRecurringTemplate,
  isRecurringTemplateDueToday,
  readRecurringTemplates,
  RecurringTemplate,
  saveRecurringTemplate,
} from "@/lib/recurring-task-templates";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Department = { id: string; name: string };

export function RecurringTasksCenter({
  currentUserId,
  departments,
  userDepartmentId,
  allowOtherDepartment,
}: {
  currentUserId: string;
  departments: Department[];
  userDepartmentId?: string | null;
  allowOtherDepartment?: boolean;
}) {
  const fallbackDepartmentId = userDepartmentId || (allowOtherDepartment ? OTHER_DEPARTMENT_ID : departments[0]?.id || "");
  const [templates, setTemplates] = useState<RecurringTemplate[]>([]);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [departmentId, setDepartmentId] = useState(fallbackDepartmentId);
  const [recurrenceType, setRecurrenceType] = useState<RecurringTemplate["recurrenceType"]>("daily");
  const [interval, setIntervalValue] = useState("1");
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [monthlyDay, setMonthlyDay] = useState(String(new Date().getDate()));
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    setTemplates(readRecurringTemplates());
  }, []);

  const canSave = taskTitle.trim().length > 0 && departmentId.length > 0;
  const departmentName = useMemo(
    () =>
      departmentId === OTHER_DEPARTMENT_ID
        ? "Other"
        : departments.find((department) => department.id === departmentId)?.name ?? "General",
    [departmentId, departments],
  );

  function handleSave() {
    if (!canSave) {
      toast.error("Write the task title first.");
      return;
    }

    const next = saveRecurringTemplate({
      id: crypto.randomUUID(),
      taskTitle: taskTitle.trim(),
      taskDescription: taskDescription.trim(),
      priority,
      departmentId,
      recurrenceType,
      interval: Math.max(1, Number(interval) || 1),
      weekdays,
      monthlyDay: Math.min(31, Math.max(1, Number(monthlyDay) || 1)),
      startDate,
      endDate,
    });

    setTemplates(next);
    setTaskTitle("");
    setTaskDescription("");
    setPriority("normal");
    setDepartmentId(fallbackDepartmentId);
    setRecurrenceType("daily");
    setIntervalValue("1");
    setWeekdays([1, 2, 3, 4, 5]);
    setMonthlyDay(String(new Date().getDate()));
    setStartDate(new Date().toISOString().slice(0, 10));
    setEndDate("");
    toast.success("Recurring task saved.");
  }

  function handleUseTemplate(template: RecurringTemplate) {
    appendRecurringTemplateToTodayPlan(template, currentUserId, departments[0]?.id || "");
    toast.success(`${template.taskTitle} added to today's plan draft.`);
  }

  function handleDelete(templateId: string) {
    setTemplates(deleteRecurringTemplate(templateId));
    toast.success("Recurring task deleted.");
  }

  function toggleWeekday(day: number) {
    setWeekdays((current) =>
      current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort((a, b) => a - b),
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Recurring Task Setup</CardTitle>
          <p className="text-sm text-[var(--muted-foreground)]">
            Save daily repeat work once, then add it to today&apos;s plan from dashboard or this page in one click.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Task Title</Label>
              <Input placeholder="Daily standup, server check, follow-up call" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} />
            </div>
            <div>
              <Label>Department</Label>
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allowOtherDepartment ? <SelectItem value={OTHER_DEPARTMENT_ID}>Other</SelectItem> : null}
                  {departments.map((department) => (
                    <SelectItem key={department.id} value={department.id}>
                      {department.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["low", "normal", "high", "critical"].map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button className="button-force-white w-full bg-[#4f5ef7] hover:bg-[#4453eb]" disabled={!canSave} onClick={handleSave} type="button">
                <Plus className="h-4 w-4" /> Save Recurring Task
              </Button>
            </div>
          </div>
          <div>
            <Label>Description</Label>
            <Textarea placeholder="Optional note for this recurring work." value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} />
          </div>
          <div className="grid gap-4 rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-4 lg:grid-cols-2">
            <div className="space-y-4">
              <div>
                <Label>Repeat Type</Label>
                <Select value={recurrenceType} onValueChange={(value: RecurringTemplate["recurrenceType"]) => setRecurrenceType(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Repeat Every</Label>
                <Input min="1" type="number" value={interval} onChange={(event) => setIntervalValue(event.target.value)} />
              </div>
              {recurrenceType === "monthly" ? (
                <div>
                  <Label>Monthly Day</Label>
                  <Input max="31" min="1" type="number" value={monthlyDay} onChange={(event) => setMonthlyDay(event.target.value)} />
                </div>
              ) : null}
            </div>
            <div className="space-y-4">
              <div>
                <Label>Start Date</Label>
                <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </div>
              <div>
                <Label>End Date</Label>
                <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              </div>
              {recurrenceType === "weekly" ? (
                <div>
                  <Label>Show On</Label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {[
                      { value: 1, label: "Mon" },
                      { value: 2, label: "Tue" },
                      { value: 3, label: "Wed" },
                      { value: 4, label: "Thu" },
                      { value: 5, label: "Fri" },
                      { value: 6, label: "Sat" },
                      { value: 0, label: "Sun" },
                    ].map((day) => (
                      <button
                        key={day.label}
                        className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                          weekdays.includes(day.value)
                            ? "bg-[#4f5ef7] text-white"
                            : "border border-[var(--panel-border)] bg-[var(--panel)] text-[var(--foreground)]"
                        }`}
                        onClick={() => toggleWeekday(day.value)}
                        type="button"
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <div className="rounded-2xl border border-dashed border-[var(--panel-border)] bg-[var(--panel-muted)] px-4 py-3 text-sm text-[var(--muted-foreground)]">
            This task will be saved for <span className="font-semibold text-[var(--foreground)]">{departmentName}</span> and will show automatically based on the repeat schedule you set here.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Saved Recurring Tasks</CardTitle>
        </CardHeader>
        <CardContent>
          {templates.length ? (
            <div className="space-y-3">
              {templates.map((template, index) => (
                <div key={template.id} className="flex flex-col gap-3 rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600">
                      <Repeat2 className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--foreground)]">
                        {index + 1}. {template.taskTitle}
                      </p>
                      <p className="mt-1 text-sm text-[var(--muted-foreground)]">{template.taskDescription || "No extra description saved."}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">{template.priority}</span>
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                          {template.departmentId === OTHER_DEPARTMENT_ID
                            ? "Other"
                            : departments.find((department) => department.id === template.departmentId)?.name ?? "General"}
                        </span>
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
                          {describeRecurringTemplate(template)}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-1 ${
                            isRecurringTemplateDueToday(template) ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {isRecurringTemplateDueToday(template) ? "Showing today" : "Not showing today"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button className="button-force-white bg-[#4f5ef7] hover:bg-[#4453eb]" onClick={() => handleUseTemplate(template)} type="button">
                      Add To Today&apos;s Plan
                    </Button>
                    <Button className="button-force-white bg-rose-500 hover:bg-rose-600" onClick={() => handleDelete(template.id)} type="button">
                      <Trash2 className="h-4 w-4" /> Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[var(--panel-border)] bg-[var(--panel-muted)] px-4 py-5 text-sm text-[var(--muted-foreground)]">
              No recurring task saved yet.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
