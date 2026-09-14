export type DashboardWorkPlanTask = {
  id: string;
  taskTitle: string;
  taskDescription?: string | null;
  priority: string;
  planDate: string;
  assignedBy?: string | null;
  userId: string;
  departmentName: string;
  /** Ordering falls back to this for a task that has not been worked on yet. */
  createdAt?: string | null;
  updates: Array<{
    status: "done" | "in_progress" | "pending";
    note?: string | null;
    trackedMinutes: number;
    actualStart?: string | null;
    actualEnd?: string | null;
    reportDate?: string | null;
    updatedAt?: string | null;
  }>;
  latestReview?: {
    id: string;
    status: "pending" | "approved" | "rejected";
    submitNote: string;
    reviewNote: string | null;
    createdAt: string;
    reviewedAt: string | null;
    requestedById: string;
    reviewerId: string | null;
  } | null;
};
