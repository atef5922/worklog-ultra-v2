import { toDateOnly } from "@/lib/utils";

export type RecurringTemplate = {
  id: string;
  taskTitle: string;
  taskDescription: string;
  priority: string;
  departmentId: string;
  recurrenceType: "daily" | "weekly" | "monthly";
  interval: number;
  weekdays: number[];
  monthlyDay: number;
  startDate: string;
  endDate: string;
};

export type PlanDraftTask = {
  id?: string;
  clientId: string;
  taskTitle: string;
  taskDescription: string;
  priority: string;
  departmentId: string;
  assigneeId: string;
};

type PlanDraftSnapshot = {
  tasks: PlanDraftTask[];
  timers: Record<string, unknown>;
};

export const RECURRING_TEMPLATES_STORAGE_KEY = "worklog-recurring-templates";
export const OTHER_DEPARTMENT_ID = "__other__";

export function getTodayPlanDraftStorageKey() {
  return `worklog-plan-draft:${toDateOnly()}`;
}

export function readRecurringTemplates() {
  if (typeof window === "undefined") {
    return [] as RecurringTemplate[];
  }

  const raw = window.localStorage.getItem(RECURRING_TEMPLATES_STORAGE_KEY);
  if (!raw) {
    return [] as RecurringTemplate[];
  }

  try {
    const parsed = JSON.parse(raw) as Partial<RecurringTemplate>[];
    return parsed.map((template) => ({
      id: template.id ?? crypto.randomUUID(),
      taskTitle: template.taskTitle ?? "",
      taskDescription: template.taskDescription ?? "",
      priority: template.priority ?? "normal",
      departmentId: template.departmentId ?? "",
      recurrenceType: template.recurrenceType ?? "daily",
      interval: Math.max(1, Number(template.interval) || 1),
      weekdays: Array.isArray(template.weekdays) && template.weekdays.length ? template.weekdays : [1, 2, 3, 4, 5],
      monthlyDay: Math.min(31, Math.max(1, Number(template.monthlyDay) || 1)),
      startDate: template.startDate ?? new Date().toISOString().slice(0, 10),
      endDate: template.endDate ?? "",
    }));
  } catch {
    return [] as RecurringTemplate[];
  }
}

export function writeRecurringTemplates(templates: RecurringTemplate[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(RECURRING_TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
}

export function saveRecurringTemplate(template: RecurringTemplate) {
  const current = readRecurringTemplates();
  const nextTemplate = {
    ...template,
    id: template.id || crypto.randomUUID(),
  };
  const next = [nextTemplate, ...current.filter((item) => item.id !== nextTemplate.id)].slice(0, 20);
  writeRecurringTemplates(next);
  return next;
}

export function deleteRecurringTemplate(templateId: string) {
  const next = readRecurringTemplates().filter((item) => item.id !== templateId);
  writeRecurringTemplates(next);
  return next;
}

export function isRecurringTemplateDueToday(template: RecurringTemplate, today = new Date()) {
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startDate = new Date(`${template.startDate}T00:00:00`);

  if (Number.isNaN(startDate.getTime()) || todayDate < startDate) {
    return false;
  }

  if (template.endDate) {
    const endDate = new Date(`${template.endDate}T23:59:59`);
    if (!Number.isNaN(endDate.getTime()) && todayDate > endDate) {
      return false;
    }
  }

  const diffDays = Math.floor((todayDate.getTime() - startDate.getTime()) / 86400000);

  if (template.recurrenceType === "daily") {
    return diffDays % Math.max(1, template.interval) === 0;
  }

  if (template.recurrenceType === "weekly") {
    const weekDiff = Math.floor(diffDays / 7);
    return weekDiff % Math.max(1, template.interval) === 0 && template.weekdays.includes(todayDate.getDay());
  }

  if (template.recurrenceType === "monthly") {
    const monthDiff =
      (todayDate.getFullYear() - startDate.getFullYear()) * 12 + (todayDate.getMonth() - startDate.getMonth());

    return monthDiff % Math.max(1, template.interval) === 0 && todayDate.getDate() === template.monthlyDay;
  }

  return false;
}

export function isRecurringTemplateActiveNow(template: RecurringTemplate, today = new Date()) {
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startDate = new Date(`${template.startDate}T00:00:00`);

  if (Number.isNaN(startDate.getTime()) || todayDate < startDate) {
    return false;
  }

  if (template.endDate) {
    const endDate = new Date(`${template.endDate}T23:59:59`);
    if (!Number.isNaN(endDate.getTime()) && todayDate > endDate) {
      return false;
    }
  }

  return true;
}

export function describeRecurringTemplate(template: RecurringTemplate) {
  if (template.recurrenceType === "daily") {
    return template.interval === 1 ? "Shows every day" : `Shows every ${template.interval} days`;
  }

  if (template.recurrenceType === "weekly") {
    const days = template.weekdays
      .map((day) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day])
      .join(", ");
    return template.interval === 1 ? `Shows every week on ${days}` : `Shows every ${template.interval} weeks on ${days}`;
  }

  return template.interval === 1
    ? `Shows monthly on day ${template.monthlyDay}`
    : `Shows every ${template.interval} months on day ${template.monthlyDay}`;
}

export function appendRecurringTemplateToTodayPlan(template: RecurringTemplate, assigneeId: string, fallbackDepartmentId = "") {
  if (typeof window === "undefined") {
    return;
  }

  const storageKey = getTodayPlanDraftStorageKey();
  const raw = window.localStorage.getItem(storageKey);

  let parsed: PlanDraftSnapshot = {
    tasks: [],
    timers: {},
  };

  if (raw) {
    try {
      parsed = JSON.parse(raw) as PlanDraftSnapshot;
    } catch {
      parsed = { tasks: [], timers: {} };
    }
  }

  parsed.tasks.push({
    clientId: crypto.randomUUID(),
    taskTitle: template.taskTitle,
    taskDescription: template.taskDescription,
    priority: template.priority,
    departmentId: template.departmentId === OTHER_DEPARTMENT_ID ? fallbackDepartmentId : template.departmentId,
    assigneeId,
  });

  window.localStorage.setItem(storageKey, JSON.stringify(parsed));
}
