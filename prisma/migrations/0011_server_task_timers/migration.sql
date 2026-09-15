BEGIN;
CREATE TABLE IF NOT EXISTS task_timer_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES daily_tasks(id) ON DELETE RESTRICT,
  report_date date NOT NULL,
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  tracked_milliseconds integer NOT NULL DEFAULT 0 CHECK (tracked_milliseconds BETWEEN 0 AND 86400000),
  actual_start timestamptz(6),
  actual_end timestamptz(6),
  running_started_at timestamptz(6),
  last_command_id text,
  last_action text,
  updated_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT task_timer_states_task_id_report_date_key UNIQUE (task_id, report_date),
  CONSTRAINT task_timer_state_order CHECK (actual_end IS NULL OR (actual_start IS NULL AND tracked_milliseconds = 0) OR actual_end >= actual_start),
  CONSTRAINT task_timer_running_order CHECK (running_started_at IS NULL OR (actual_start IS NOT NULL AND running_started_at >= actual_start AND actual_end IS NULL))
);
-- Prisma-generated test schemas need the same checks as migrated databases.
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='task_timer_states'::regclass AND conname='task_timer_state_order') THEN
  ALTER TABLE task_timer_states ADD CONSTRAINT task_timer_state_order CHECK (actual_end IS NULL OR (actual_start IS NULL AND tracked_milliseconds = 0) OR actual_end >= actual_start);
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='task_timer_states'::regclass AND conname='task_timer_running_order') THEN
  ALTER TABLE task_timer_states ADD CONSTRAINT task_timer_running_order CHECK (running_started_at IS NULL OR (actual_start IS NOT NULL AND running_started_at >= actual_start AND actual_end IS NULL));
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='task_timer_states'::regclass AND conname='task_timer_ms_range') THEN
  ALTER TABLE task_timer_states ADD CONSTRAINT task_timer_ms_range CHECK (tracked_milliseconds BETWEEN 0 AND 86400000);
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='task_timer_states'::regclass AND conname='task_timer_start_evidence') THEN
  ALTER TABLE task_timer_states ADD CONSTRAINT task_timer_start_evidence CHECK (tracked_milliseconds = 0 OR actual_start IS NOT NULL);
 END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS task_timer_one_running_per_task ON task_timer_states(task_id) WHERE running_started_at IS NOT NULL;
COMMIT;
