-- CreateEnum
CREATE TYPE "TaskActivityType" AS ENUM ('completed', 'reopened');

-- CreateTable
CREATE TABLE "task_activity_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "daily_task_id" UUID NOT NULL,
    "actor_id" UUID,
    "event_type" "TaskActivityType" NOT NULL,
    "cycle" INTEGER NOT NULL,
    "reason" TEXT,
    "note" TEXT,
    "report_date" DATE NOT NULL,
    "tracked_minutes" INTEGER NOT NULL DEFAULT 0,
    "actual_start" TIMESTAMPTZ(6),
    "actual_end" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_activity_events_pkey" PRIMARY KEY ("id")
);

-- Preserve every completion that existed before lifecycle history was added.
WITH completed_updates AS (
    SELECT
        "daily_task_id",
        "report_date",
        "note",
        "tracked_minutes",
        "actual_start",
        "actual_end",
        "updated_at",
        ROW_NUMBER() OVER (
            PARTITION BY "daily_task_id"
            ORDER BY "report_date" ASC, "updated_at" ASC
        )::INTEGER AS "cycle"
    FROM "daily_task_updates"
    WHERE
        "status" = 'done'
        OR "completion_percent" = 100
)
INSERT INTO "task_activity_events" (
    "daily_task_id",
    "event_type",
    "cycle",
    "note",
    "report_date",
    "tracked_minutes",
    "actual_start",
    "actual_end",
    "created_at"
)
SELECT
    "daily_task_id",
    'completed'::"TaskActivityType",
    "cycle",
    "note",
    "report_date",
    "tracked_minutes",
    "actual_start",
    "actual_end",
    "updated_at"
FROM completed_updates;

-- CreateIndex
CREATE UNIQUE INDEX "task_activity_events_daily_task_id_event_type_cycle_key"
ON "task_activity_events"("daily_task_id", "event_type", "cycle");

CREATE INDEX "task_activity_events_daily_task_id_created_at_idx"
ON "task_activity_events"("daily_task_id", "created_at");

-- AddForeignKey
ALTER TABLE "task_activity_events"
ADD CONSTRAINT "task_activity_events_daily_task_id_fkey"
FOREIGN KEY ("daily_task_id") REFERENCES "daily_tasks"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "task_activity_events"
ADD CONSTRAINT "task_activity_events_actor_id_fkey"
FOREIGN KEY ("actor_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
