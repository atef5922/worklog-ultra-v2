require('@next/env').loadEnvConfig(process.cwd(),true);
const path=require('node:path'),{spawnSync}=require('node:child_process');
async function run(){
 const out=path.join(process.cwd(),'.next/management-data-check.cjs');
 await require('esbuild').build({entryPoints:[path.join(__dirname,'management-check/data-smoke.ts')],outfile:out,bundle:true,platform:'node',format:'cjs',external:['@prisma/client','@prisma/adapter-pg','next/headers','next/navigation','jose','pg','date-fns'],plugins:[{name:'server-only-test-boundary',setup(build){build.onResolve({filter:/^server-only$/},()=>({path:'server-only',namespace:'empty'}));build.onLoad({filter:/.*/,namespace:'empty'},()=>({contents:'',loader:'js'}));}}]});
 const result=spawnSync(process.execPath,[out],{stdio:'inherit',windowsHide:true});process.exitCode=result.status??1;
}
run().catch(e=>{console.error(e.message);process.exitCode=1;});
