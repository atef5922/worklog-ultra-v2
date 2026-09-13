BEGIN;
ALTER TABLE daily_tasks ADD COLUMN IF NOT EXISTS project_name TEXT;
ALTER TABLE daily_tasks ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE daily_tasks ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ(6);
ALTER TABLE daily_tasks ADD COLUMN IF NOT EXISTS estimated_minutes INTEGER;
ALTER TABLE daily_tasks ADD COLUMN IF NOT EXISTS checklist JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE daily_tasks ADD COLUMN IF NOT EXISTS planning_version INTEGER NOT NULL DEFAULT 0;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='daily_tasks_estimated_minutes_check') THEN
  ALTER TABLE daily_tasks ADD CONSTRAINT daily_tasks_estimated_minutes_check CHECK (estimated_minutes IS NULL OR estimated_minutes BETWEEN 1 AND 525600);
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='daily_tasks_checklist_array_check') THEN
  ALTER TABLE daily_tasks ADD CONSTRAINT daily_tasks_checklist_array_check CHECK (jsonb_typeof(checklist)='array');
 END IF;
END $$;
CREATE INDEX IF NOT EXISTS daily_tasks_due_idx ON daily_tasks(due_at);
CREATE TABLE IF NOT EXISTS employee_presence (
 user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 last_seen_at TIMESTAMPTZ(6) NOT NULL,
 meeting_started_at TIMESTAMPTZ(6),
 updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
COMMIT;
