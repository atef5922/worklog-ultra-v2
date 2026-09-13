// Isolated headless UI tests; synthetic records only, no user login/session access.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const esbuild=require('esbuild'),{chromium}=require('playwright-core');
async function run(){
 const root=path.resolve(__dirname,'..'),out=path.join(root,'.next/management-check');fs.mkdirSync(out,{recursive:true});
 const html=await(await fetch('http://localhost:3000/auth/login')).text();
 const css=[...html.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)].map(m=>/href="([^"]+)"/.exec(m[0])?.[1]).filter(Boolean);
 const bundle=await esbuild.build({entryPoints:[path.join(__dirname,'management-check/entry.tsx')],bundle:true,write:false,outdir:out,format:'iife',platform:'browser',jsx:'automatic',loader:{'.module.css':'local-css'},define:{'process.env.NODE_ENV':'"development"'},alias:{'next/link':path.join(__dirname,'sidebar-check/link.tsx')}});
 const js=bundle.outputFiles.find(f=>f.path.endsWith('.js')).text,style=bundle.outputFiles.find(f=>f.path.endsWith('.css')).text;
 const server=http.createServer((req,res)=>{if(req.url==='/fixture.js'){res.setHeader('content-type','text/javascript');return res.end(js);}if(req.url==='/fixture.css'){res.setHeader('content-type','text/css');return res.end(style);}if(req.url.startsWith('/api/')){res.statusCode=503;res.setHeader('content-type','application/json');return res.end('{"message":"Synthetic offline test"}');}res.setHeader('content-type','text/html');res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">${css.map(h=>`<link rel="stylesheet" href="http://localhost:3000${h}">`).join('')}<link rel="stylesheet" href="/fixture.css"><style>body{margin:0;background:#f1f5fb;font-family:Arial,sans-serif}*{box-sizing:border-box}:root{--foreground:#162640;--muted-foreground:#6d7e97;--panel:#fff;--panel-muted:#f5f7fc;--panel-border:#dce5f1}button,input,select{font:inherit}</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>`);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge',headless:true});const base=`http://127.0.0.1:${server.address().port}`,errors=[];
 try{for(const [width,height] of [[1600,900],[1365,768],[390,844]]){const page=await browser.newPage({viewport:{width,height}});page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.getByRole('heading',{name:'Management Dashboard',exact:true}).waitFor();await page.waitForTimeout(250);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Page must not overflow horizontally');
  assert.equal(await page.locator('table').first().locator('tbody tr').count(),10);
  await page.getByRole('button',{name:'Next task page'}).click();assert.equal(await page.locator('table').first().locator('tbody tr').count(),4);
  await page.getByRole('button',{name:'Previous task page'}).click();await page.getByLabel('Sort tasks').selectOption('employee');
  await page.locator('summary').filter({hasText:'Export'}).click();assert((await page.getByRole('link',{name:'PDF',exact:true}).getAttribute('href')).includes('format=pdf'));
  await page.locator('summary').filter({hasText:'Export'}).click();
  await page.locator('#live-team').getByRole('button',{name:'View all'}).click();assert.equal(await page.locator('#live-team a').count(),8);
  await page.screenshot({path:path.join(out,`dashboard-${width}.png`),fullPage:true});console.log('PASS management layout, pagination, sort, export and live list',width,height);await page.close();
 }
 const page=await browser.newPage({viewport:{width:1365,height:768}});await page.goto(base+'/?empty');await page.getByText('No tasks match these filters.').waitFor();assert(await page.getByRole('button',{name:'Next task page'}).isDisabled());console.log('PASS empty state');await page.close();assert.deepEqual(errors,[],'No browser runtime errors');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
