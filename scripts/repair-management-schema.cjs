// Targeted, backup-first repair for an app already generated with migration 0009.
// Run without arguments to validate inside a rolled-back transaction.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { loadEnvConfig } = require('@next/env');
const { Client } = require('pg');

const root = path.resolve(__dirname, '..');
loadEnvConfig(root, process.env.NODE_ENV !== 'production');
const apply = process.argv.includes('--apply');
const url = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
  throw new Error('This repair is limited to the local database. Use the deployment migration process for remote databases.');
}
const config = {
  host: url.hostname, port: Number(url.port || 5432),
  user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
  database: decodeURIComponent(url.pathname.slice(1)), ssl: false,
};
const client = new Client(config);
const migration = fs.readFileSync(path.join(root, 'prisma/migrations/0009_management_access/migration.sql'), 'utf8');
if (!/^BEGIN;/.test(migration) || !/COMMIT;\s*$/.test(migration)) throw new Error('Expected transactional migration.');
const transactionalSql = migration.replace(/^BEGIN;/, '').replace(/COMMIT;\s*$/, '');

async function userSnapshot() {
  const { rows } = await client.query('SELECT id::text, role::text, to_jsonb(users) - ARRAY[\'role\',\'management_enabled\',\'access_version\',\'team_id\'] AS account FROM users ORDER BY id');
  return rows.map(row => ({ id: row.id, role: row.role, digest: crypto.createHash('sha256').update(JSON.stringify(row.account)).digest('hex') }));
}

async function run() {
  await client.connect();
  await client.query("SELECT pg_advisory_lock(hashtext('worklog-management-schema-repair'))");
  const labels = (await client.query("SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='UserRole'")).rows.map(row => row.enumlabel);
  const isLegacy = !labels.includes('super_admin');
  const before = await userSnapshot();
  const mapping = isLegacy ? { admin: 'super_admin', hr: 'admin', manager: 'team_head', employee: 'employee' } : { super_admin: 'super_admin', moderator: 'moderator', admin: 'admin', team_head: 'team_head', employee: 'employee' };
  if (before.some(user => !mapping[user.role])) throw new Error('Unrecognized account role: manual mapping required before any change.');

  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query(transactionalSql);
  const after = await userSnapshot();
  if (JSON.stringify(after) !== JSON.stringify(before.map(user => ({...user, role: mapping[user.role]})))) {
    throw new Error('Account preservation check failed.');
  }
  for (const table of ['teams', 'user_permissions', 'user_access_scopes', 'management_audit_logs', 'task_timeline_entries']) {
    await client.query(`SELECT 1 FROM ${table} LIMIT 0`);
  }
  await client.query('SELECT management_enabled, access_version, team_id FROM users LIMIT 0');
  await client.query('ROLLBACK');
  console.log('PASS: migration dry run; existing account credentials and profile data preserved; role mapping verified.');
  if (!apply) return;

  const backupDir = path.join(root, '.local-backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backup = path.join(backupDir, `before-management-login-repair-${new Date().toISOString().replace(/[:.]/g, '-')}.dump`);
  const executable = name => path.join(root, 'desktop-runtime/postgres/bin', `${name}.exe`);
  const result = spawnSync(executable('pg_dump'), ['--format=custom', '--no-owner', '--no-acl', '--file', backup], {
    encoding: 'utf8', windowsHide: true,
    env: {...process.env, PGHOST: config.host, PGPORT: String(config.port), PGUSER: config.user, PGPASSWORD: config.password, PGDATABASE: config.database},
  });
  if (result.status !== 0) throw new Error('Database backup failed; migration was not applied.');
  const listing = spawnSync(executable('pg_restore'), ['--list', backup], {encoding: 'utf8', windowsHide: true});
  if (listing.status !== 0 || !listing.stdout.includes('TABLE DATA')) throw new Error('Backup verification failed; migration was not applied.');
  console.log('Verified backup:', path.relative(root, backup));

  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query(transactionalSql);
  const saved = await userSnapshot();
  // Revalidate against the original snapshot; a concurrent account edit aborts safely.
  if (JSON.stringify(saved) !== JSON.stringify(before.map(user => ({...user, role: mapping[user.role]})))) throw new Error('Concurrent account change detected; retry repair.');
  await client.query('COMMIT');
  console.log('PASS: management schema applied; existing passwords and employee records were not reset.');
}

run().catch(async error => {
  await client.query('ROLLBACK').catch(() => {});
  console.error('Repair failed:', error.code ?? '', error.message);
  process.exitCode = 1;
}).finally(() => client.end());
