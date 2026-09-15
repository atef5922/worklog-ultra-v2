// Creates a disposable PostgreSQL cluster; never connects to the app database.
// Prisma may load local config while generating SQL, but its DATABASE_URL is overridden for this child only.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawnSync, spawn } = require('node:child_process');
const { Pool } = require('pg');
const root = path.resolve(__dirname, '..');
const bin = path.join(root, 'desktop-runtime/postgres/bin');
const run = (exe, args, options = {}) => {
  const result = spawnSync(exe, args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 60000, ...options });
  if (result.status !== 0) throw new Error(result.error?.message ?? result.stderr ?? 'Test helper failed');
  return result.stdout;
};
async function main() {
  for (const exe of ['initdb.exe', 'pg_ctl.exe']) if (!fs.existsSync(path.join(bin, exe))) throw new Error('Isolated PostgreSQL binaries are required in desktop-runtime/postgres/bin. No app database fallback is allowed.');
  const tempRoot = fs.realpathSync(os.tmpdir());
  const temporary = fs.mkdtempSync(path.join(tempRoot, 'worklog-attendance-test-'));
  const data = path.join(temporary, 'data');
  let started = false, pool;
  try {
    const reservation = net.createServer();
    await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
    const port = reservation.address().port;
    await new Promise(resolve => reservation.close(resolve));
    run(path.join(bin, 'initdb.exe'), ['-D', data, '-U', 'attendance_test', '--auth=trust', '--no-sync', '--no-locale', '-E', 'UTF8']);
    run(path.join(bin, 'pg_ctl.exe'), ['-D', data, '-l', path.join(temporary, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start']);
    started = true;
    pool = new Pool({ host: '127.0.0.1', port, user: 'attendance_test', database: 'postgres' });
    await pool.query('CREATE DATABASE worklog_attendance_isolated_test'); await pool.end();
    const databaseUrl = `postgresql://attendance_test@127.0.0.1:${port}/worklog_attendance_isolated_test`;
    pool = new Pool({ connectionString: databaseUrl });
    const env = { ...process.env, DATABASE_URL: databaseUrl, WORKLOG_ISOLATED_ATTENDANCE_TEST: '1' };
    const sql = run(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'diff', '--from-empty', '--to-schema', 'prisma/schema.prisma', '--script'], { env });
    // Some local Prisma config loaders print a dotenv banner before the SQL.
    const sqlStart = sql.search(/^-- CreateSchema/m);
    if (sqlStart < 0) throw new Error('Prisma did not produce the expected schema SQL.');
    await pool.query(sql.slice(sqlStart));
    await pool.query(fs.readFileSync(path.join(root,'prisma/migrations/0011_server_task_timers/migration.sql'),'utf8'));
    // These range checks exist in the production SQL migration, beyond the Prisma schema.
    await pool.query('ALTER TABLE attendance_work_sessions ADD CHECK (ended_at IS NULL OR ended_at >= started_at)');
    await pool.query('ALTER TABLE attendance_break_sessions ADD CHECK (ended_at IS NULL OR ended_at >= started_at)');
    await pool.end(); pool = null;
    console.log('Running actual attendance handlers against a fresh, loopback-only PostgreSQL database.');
    const code = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--config', 'scripts/attendance-check/postgres.config.ts'], { cwd: root, env, stdio: 'inherit', windowsHide: true });
      child.once('error', reject); child.once('exit', resolve);
    });
    if (code !== 0) throw new Error(`Isolated attendance tests exited ${code}`);
  } finally {
    if (pool) await pool.end();
    if (started) run(path.join(bin, 'pg_ctl.exe'), ['-D', data, '-m', 'fast', '-w', 'stop']);
    // Only remove the exact temporary directory this invocation created; never a workspace/app database.
    if (fs.realpathSync(temporary) !== temporary || path.dirname(temporary) !== tempRoot || !path.basename(temporary).startsWith('worklog-attendance-test-')) throw new Error('Unsafe test cleanup target');
    fs.rmSync(temporary, { recursive: true });
    console.log('Isolated test database stopped and temporary synthetic data removed.');
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
