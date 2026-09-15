// Additive migration only. Dry-run by default; --apply requires a verified backup.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
require('@next/env').loadEnvConfig(process.cwd(),true);
const {Client}=require('pg');
const root=path.resolve(__dirname,'..'),url=new URL(process.env.DATABASE_URL);
if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('Use a reviewed deployment migration for remote databases.');
const config={host:url.hostname,port:Number(url.port||5432),user:decodeURIComponent(url.username),password:decodeURIComponent(url.password),database:decodeURIComponent(url.pathname.slice(1)),ssl:false};
const client=new Client(config);
const sql=fs.readFileSync(path.join(root,'prisma/migrations/0011_server_task_timers/migration.sql'),'utf8').replace(/^BEGIN;/,'').replace(/COMMIT;\s*$/,'');
async function fingerprint(){
 const result={};
 for(const table of ['users','daily_tasks','daily_task_updates','attendance_records','attendance_work_sessions','attendance_break_sessions','task_activity_events','task_timeline_entries']){
  const excluded='';
  const {rows}=await client.query(`SELECT to_jsonb(t)${excluded} AS data FROM ${table} t ORDER BY id`);
  result[table]=crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
 }
 return JSON.stringify(result);
}
async function verify(){
 await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='5s'");
 const before=await fingerprint();await client.query(sql);
 if(before!==await fingerprint())throw Error('Existing records changed during migration; rolling back.');
 await client.query('SELECT task_id,report_date,tracked_milliseconds,running_started_at,version FROM task_timer_states LIMIT 0');
 await client.query("SELECT indexname FROM pg_indexes WHERE indexname='task_timer_one_running_per_task'");
}
async function run(){
 await client.connect();await client.query("SELECT pg_advisory_lock(hashtext('worklog-task-timer-schema'))");
 await verify();await client.query('ROLLBACK');console.log('PASS: additive migration dry run; existing account, attendance and task evidence unchanged.');
 if(!process.argv.includes('--apply'))return;
 const dir=path.join(root,'.local-backups');fs.mkdirSync(dir,{recursive:true});
 const backup=path.join(dir,`before-task-timers-${new Date().toISOString().replace(/[:.]/g,'-')}.dump`);
 const exe=name=>path.join(root,'desktop-runtime/postgres/bin',name+'.exe');
 const result=spawnSync(exe('pg_dump'),['--format=custom','--no-owner','--no-acl','--file',backup],{windowsHide:true,encoding:'utf8',env:{...process.env,PGHOST:config.host,PGPORT:String(config.port),PGUSER:config.user,PGPASSWORD:config.password,PGDATABASE:config.database}});
 if(result.status!==0)throw Error('Backup failed; no migration applied.');
 const listing=spawnSync(exe('pg_restore'),['--list',backup],{windowsHide:true,encoding:'utf8'});
 if(listing.status!==0||!listing.stdout.includes('TABLE DATA'))throw Error('Backup verification failed.');
 console.log('Verified backup:',path.relative(root,backup));
 await verify();await client.query('COMMIT');console.log('PASS: server timer schema applied; old records preserved.');
}
run().catch(async e=>{await client.query('ROLLBACK').catch(()=>{});console.error('Migration failed:',e.message);process.exitCode=1;}).finally(()=>client.end());
