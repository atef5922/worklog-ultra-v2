BEGIN;
ALTER TABLE user_access_scopes ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE user_access_scopes DROP CONSTRAINT IF EXISTS user_access_scopes_check;
ALTER TABLE user_access_scopes ADD CONSTRAINT user_access_scopes_check CHECK (
 (scope_type='departments' AND department_id IS NOT NULL AND team_id IS NULL AND employee_id IS NULL) OR
 (scope_type='teams' AND team_id IS NOT NULL AND department_id IS NULL AND employee_id IS NULL) OR
 (scope_type='employees' AND employee_id IS NOT NULL AND department_id IS NULL AND team_id IS NULL) OR
 (scope_type IN ('all_company','own_team','self') AND department_id IS NULL AND team_id IS NULL AND employee_id IS NULL)
);
ALTER TABLE user_access_scopes DROP CONSTRAINT IF EXISTS user_access_scopes_scope_type_check;
ALTER TABLE user_access_scopes ADD CONSTRAINT user_access_scopes_scope_type_check
 CHECK (scope_type IN ('all_company','departments','teams','employees','own_team','self'));

CREATE TABLE attendance_day_overrides (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 attendance_date date NOT NULL,
 subject_key text NOT NULL,
 kind text NOT NULL CHECK (kind IN ('off','leave','workday')),
 reason text NOT NULL,
 department_id uuid REFERENCES departments(id) ON DELETE CASCADE,
 employee_id uuid REFERENCES users(id) ON DELETE CASCADE,
 created_by text NOT NULL,
 created_at timestamptz(6) NOT NULL DEFAULT now(),
 updated_at timestamptz(6) NOT NULL DEFAULT now(),
 UNIQUE (attendance_date,subject_key),
 CHECK (
  (subject_key='company' AND department_id IS NULL AND employee_id IS NULL) OR
  (subject_key LIKE 'department:%' AND department_id IS NOT NULL AND employee_id IS NULL) OR
  (subject_key LIKE 'employee:%' AND employee_id IS NOT NULL AND department_id IS NULL)
 )
);
CREATE INDEX attendance_day_overrides_date_idx ON attendance_day_overrides(attendance_date);
COMMIT;
