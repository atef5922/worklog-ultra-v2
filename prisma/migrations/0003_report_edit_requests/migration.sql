CREATE TYPE "ReportEditRequestStatus" AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE "report_edit_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "daily_task_id" UUID NOT NULL,
  "requested_by_id" UUID NOT NULL,
  "reviewer_id" UUID NULL,
  "reason" TEXT NOT NULL,
  "status" "ReportEditRequestStatus" NOT NULL DEFAULT 'pending',
  "review_note" TEXT NULL,
  "reviewed_at" TIMESTAMPTZ(6) NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "report_edit_requests_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "report_edit_requests"
ADD CONSTRAINT "report_edit_requests_daily_task_id_fkey"
FOREIGN KEY ("daily_task_id") REFERENCES "daily_tasks"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "report_edit_requests"
ADD CONSTRAINT "report_edit_requests_requested_by_id_fkey"
FOREIGN KEY ("requested_by_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "report_edit_requests"
ADD CONSTRAINT "report_edit_requests_reviewer_id_fkey"
FOREIGN KEY ("reviewer_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "report_edit_requests_daily_task_id_created_at_idx"
ON "report_edit_requests"("daily_task_id", "created_at");

CREATE INDEX "report_edit_requests_requested_by_id_created_at_idx"
ON "report_edit_requests"("requested_by_id", "created_at");

CREATE INDEX "report_edit_requests_status_created_at_idx"
ON "report_edit_requests"("status", "created_at");
