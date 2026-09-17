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
 try{const fixtureModule={exports:{}};
 new Function('module','exports',esbuild.transformSync(fs.readFileSync(path.join(__dirname,'management-check/fixture.ts'),'utf8'),{loader:'ts',format:'cjs'}).code)(fixtureModule,fixtureModule.exports);
 await require('./management-check/layout-checks.cjs')(browser,base,out,errors,fixtureModule.exports.fixture);
 await require('./management-check/filter-checks.cjs')(browser,base,fixtureModule.exports.fixture);
 const chatPage=await browser.newPage({viewport:{width:1365,height:768}});
 const chatTaskId='33333333-3333-4333-8333-333333333333';
 const chatActorId='11111111-1111-4111-8111-111111111111';
 let chatEmptyOnce=true;
 const chatMessages=[{id:'44444444-4444-4444-8444-444444444444',body:'Please review the draft.',createdAt:'2026-09-17T06:00:00.000Z',authorId:'22222222-2222-4222-8222-222222222222',authorName:'Manager'}];
 await chatPage.route('**/api/dashboard/tasks/*/comments**',async route=>{
  const request=route.request(),url=new URL(request.url());
  let body;
  if(request.method()==='POST'&&url.pathname.endsWith('/read')) body={success:true};
  else if(request.method()==='POST'){
   const input=request.postDataJSON();
   const comment={id:chatTaskId,body:input.body,createdAt:'2026-09-17T06:01:00.000Z',authorId:chatActorId,authorName:'You'};
   chatMessages.push(comment);body={success:true,comment};
  }else if(request.method()==='GET'&&url.searchParams.get('summary')!=='1'&&chatEmptyOnce){chatEmptyOnce=false;await route.fulfill({status:503,body:''});return;}
  else if(url.searchParams.get('summary')==='1') body={success:true,unreadCount:1};
  else body={success:true,taskTitle:'Task comments',unreadCount:1,hasMore:false,nextCursor:null,comments:chatMessages,currentUserId:chatActorId};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 await chatPage.goto(base);
 await chatPage.getByRole('button',{name:/Comments for/}).first().click();
 const chat=chatPage.getByRole('dialog',{name:'Task comments'});
 await chat.getByRole('alert').getByText('Could not load comments. Please try again.').waitFor();
 await chat.getByRole('button',{name:'Close comments'}).click();
 await chatPage.getByRole('button',{name:/Comments for/}).first().click();
 await chat.getByText('Please review the draft.').waitFor();
 const chatBox=await chat.boundingBox();
 assert(chatBox&&chatBox.x>900,'Comments should open in a right-side drawer');
 await chat.getByLabel('Write a task comment').fill('I have checked it.');
 await chat.getByRole('button',{name:'Send comment'}).click();
 await chat.getByText('I have checked it.').waitFor();
 await chat.getByRole('button',{name:'Close comments'}).click();
 assert.equal(await chat.isVisible(),false);
 console.log('PASS task comment drawer, reply, and close');
 await chatPage.close();
 const page=await browser.newPage({viewport:{width:1365,height:768}});await page.goto(base+'/?empty');await page.getByText('No tasks match these filters.').waitFor();assert.equal(await page.getByRole('button',{name:'Next task page'}).count(),0);console.log('PASS empty state');await page.close();assert.deepEqual(errors,[],'No browser runtime errors');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
