-- Preserve the old aggregate break value explicitly. New break segments are
-- added on top of this number, so upgrading during a workday never loses time.
ALTER TABLE "attendance_records"
ADD COLUMN "legacy_break_minutes" INTEGER NOT NULL DEFAULT 0;

UPDATE "attendance_records"
SET "legacy_break_minutes" = GREATEST("break_minutes", 0);

CREATE TABLE "attendance_work_sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "attendance_record_id" UUID NOT NULL,
  "started_at" TIMESTAMPTZ(6) NOT NULL,
  "ended_at" TIMESTAMPTZ(6),
  "end_reason" TEXT,
  "client_event_id" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "attendance_work_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "attendance_work_sessions_valid_range" CHECK ("ended_at" IS NULL OR "ended_at" >= "started_at")
);

CREATE TABLE "attendance_break_sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "attendance_record_id" UUID NOT NULL,
  "started_at" TIMESTAMPTZ(6) NOT NULL,
  "ended_at" TIMESTAMPTZ(6),
  "end_reason" TEXT,
  "client_event_id" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "attendance_break_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "attendance_break_sessions_valid_range" CHECK ("ended_at" IS NULL OR "ended_at" >= "started_at")
);

ALTER TABLE "attendance_work_sessions"
ADD CONSTRAINT "attendance_work_sessions_attendance_record_id_fkey"
FOREIGN KEY ("attendance_record_id") REFERENCES "attendance_records"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attendance_break_sessions"
ADD CONSTRAINT "attendance_break_sessions_attendance_record_id_fkey"
FOREIGN KEY ("attendance_record_id") REFERENCES "attendance_records"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "attendance_work_sessions_attendance_record_id_client_event_id_key"
ON "attendance_work_sessions"("attendance_record_id", "client_event_id");

CREATE INDEX "attendance_work_sessions_attendance_record_id_started_at_idx"
ON "attendance_work_sessions"("attendance_record_id", "started_at");

CREATE UNIQUE INDEX "attendance_break_sessions_attendance_record_id_client_event_id_key"
ON "attendance_break_sessions"("attendance_record_id", "client_event_id");

CREATE INDEX "attendance_break_sessions_attendance_record_id_started_at_idx"
ON "attendance_break_sessions"("attendance_record_id", "started_at");


-- Every old attendance row becomes one legacy work segment. The existing
-- first-in and last-out values therefore remain visible after the migration.
INSERT INTO "attendance_work_sessions" (
  "attendance_record_id",
  "started_at",
  "ended_at",
  "end_reason",
  "client_event_id",
  "created_at",
  "updated_at"
)
SELECT
  "id",
  "check_in_at",
  "check_out_at",
  CASE WHEN "check_out_at" IS NULL THEN NULL ELSE 'legacy_migration' END,
  'legacy-' || "id"::text,
  "created_at",
  CURRENT_TIMESTAMP
FROM "attendance_records"
WHERE "check_in_at" IS NOT NULL;
