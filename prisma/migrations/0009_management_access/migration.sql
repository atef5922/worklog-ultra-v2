BEGIN;
-- Rename in this order: legacy CEO/admin must never become the new HR/admin.
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='UserRole' AND e.enumlabel='super_admin') THEN
   ALTER TYPE "UserRole" RENAME VALUE 'admin' TO 'super_admin';
   ALTER TYPE "UserRole" RENAME VALUE 'hr' TO 'admin';
   ALTER TYPE "UserRole" RENAME VALUE 'manager' TO 'team_head';
 END IF;
END $$;
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'moderator';
ALTER TABLE users ADD COLUMN IF NOT EXISTS management_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS access_version integer NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS team_id uuid;
CREATE TABLE IF NOT EXISTS teams (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
 department_id uuid NOT NULL REFERENCES departments(id),
 lead_id uuid REFERENCES users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(department_id,name)
);
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='users_team_id_fkey') THEN
   ALTER TABLE users ADD CONSTRAINT users_team_id_fkey FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE SET NULL;
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS user_permissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 permission_key text NOT NULL, is_granted boolean NOT NULL DEFAULT true,
 granted_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,permission_key)
);
CREATE TABLE IF NOT EXISTS user_access_scopes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 scope_type text NOT NULL CHECK(scope_type IN ('all_company','departments','teams','own_team','self')),
 department_id uuid REFERENCES departments(id), team_id uuid REFERENCES teams(id), granted_by text NOT NULL,
 CHECK ((scope_type='departments' AND department_id IS NOT NULL AND team_id IS NULL) OR
        (scope_type='teams' AND team_id IS NOT NULL AND department_id IS NULL) OR
        (scope_type IN ('all_company','own_team','self') AND department_id IS NULL AND team_id IS NULL))
);
CREATE INDEX IF NOT EXISTS user_access_scopes_user_idx ON user_access_scopes(user_id);
CREATE TABLE IF NOT EXISTS management_audit_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id text NOT NULL, target_id text,
 action text NOT NULL, reason text, before_value jsonb, after_value jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS management_audit_target_idx ON management_audit_logs(target_id,created_at);
CREATE TABLE IF NOT EXISTS task_timeline_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), task_id uuid NOT NULL REFERENCES daily_tasks(id) ON DELETE RESTRICT,
 actor_id text NOT NULL, event_type text NOT NULL, note text, snapshot jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS task_timeline_task_idx ON task_timeline_entries(task_id,created_at);
-- Legacy grants remain stored for recovery/audit, but are not authorization inputs.
INSERT INTO management_audit_logs(actor_id,target_id,action,before_value,after_value)
 SELECT 'migration', id::text, 'legacy_access_migrated', jsonb_build_object('extraAccess',extra_access),
 jsonb_build_object('role',role::text,'managementEnabled',role::text='super_admin') FROM users
 WHERE NOT EXISTS (SELECT 1 FROM management_audit_logs WHERE action='legacy_access_migrated' AND target_id=users.id::text);
UPDATE users SET management_enabled=true WHERE role::text='super_admin';
COMMIT;
