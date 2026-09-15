// Real header + app CSS, isolated synthetic transport. Never writes employee data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const esbuild = require('esbuild');
const {chromium} = require('playwright-core');

async function main() {
  const root = path.resolve(__dirname, '..');
  const layout = fs.readFileSync(path.join(root, 'src/app/(protected)/layout.tsx'), 'utf8');
  assert(!layout.includes('EmployeePresence'), 'Meeting control must not remain in page content');
  const html = await (await fetch('http://localhost:3000/auth/login')).text();
  const css = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)].map(m => /href="([^"]+)"/.exec(m[0])?.[1]).filter(Boolean);
  assert(css.length, 'Start the local Next dev server to load the actual app CSS');
  const source = `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {DashboardHeader} from './src/components/dashboard/header';
    import {Sidebar} from './src/components/dashboard/sidebar';
    import {Toaster} from 'sonner';
    const role=new URLSearchParams(location.search).get('role')||'super_admin';
    const sidebarUser={id:'synthetic-header',name:'Header Fixture With A Long Employee Name',role,designation:'Team member',avatarUrl:null,managementEnabled:true,permissions:[]};
    const user={sidebarUser,...sidebarUser,roleTitle:role,unreadMessages:0,requestNotifications:0,assignmentNotifications:0,noticeNotifications:0,attendanceSnapshot:null};
    createRoot(document.getElementById('root')).render(
      <div style={{display:'flex',height:'100dvh',overflow:'hidden'}}>
        <Sidebar user={sidebarUser}/>
        <div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column'}}>
          <DashboardHeader user={user}/>
          <main style={{padding:24,flex:1}}><h1>Header verification</h1><p>{location.pathname}</p></main>
        </div><Toaster/>
      </div>
    );
  `;
  const bundle = await esbuild.build({stdin:{contents:source,resolveDir:root,loader:'tsx'},bundle:true,write:false,
    platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"','process.env':'{}'},
    alias:{'next/navigation':path.join(__dirname,'sidebar-check/navigation.ts'),'next/link':path.join(__dirname,'sidebar-check/link.tsx')}});
  let meeting = null, failNext = false;
  const requests = [];
  const server = http.createServer(async (req,res) => {
    if(req.url==='/fixture.js'){res.setHeader('Content-Type','text/javascript');return res.end(bundle.outputFiles[0].text);}
    if(req.url.startsWith('/api/')){
      res.setHeader('Content-Type','application/json');
      if(req.url==='/api/dashboard/presence'){
        const chunks=[];for await(const chunk of req)chunks.push(chunk);
        const body=JSON.parse(Buffer.concat(chunks).toString());requests.push(body.action);
        if(failNext&&body.action!=='heartbeat'){failNext=false;res.statusCode=409;return res.end(JSON.stringify({message:'Synthetic meeting save rejected'}));}
        if(body.action==='meeting_start')meeting=new Date().toISOString();
        if(body.action==='meeting_end')meeting=null;
        return res.end(JSON.stringify({presence:{meetingStartedAt:meeting,lastSeenAt:new Date().toISOString()}}));
      }
      return res.end(JSON.stringify({success:true,unreadCount:0,notifications:[],notices:[]}));
    }
    res.setHeader('Content-Type','text/html');
    res.end(`<!doctype html><html data-theme="light" data-sidebar-collapsed="true"><head>${css.map(h=>`<link rel="stylesheet" href="http://localhost:3000${h}">`).join('')}</head><body><div id="root"></div><script src="/fixture.js"></script></body></html>`);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser=await chromium.launch({channel:'msedge',headless:true});
    const page=await browser.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error'&&/unique.*key|hydration/i.test(m.text()))errors.push(m.text());});
    const base='http://127.0.0.1:'+server.address().port;
    await page.addInitScript(()=>{if(localStorage.getItem('worklog-sidebar-pinned')===null)localStorage.setItem('worklog-sidebar-pinned','false');});
    for(const route of ['/management','/dashboard','/dashboard/report','/dashboard/history','/dashboard/attendance','/dashboard/settings']){
      const before=requests.filter(a=>a==='heartbeat').length;
      await page.goto(base+route);
      await page.waitForFunction(()=>document.querySelector('[data-meeting-control]'));
      await page.waitForTimeout(150);
      assert.equal(await page.locator('header [data-meeting-control]').count(),1,route);
      assert.equal(await page.locator('main [data-meeting-control]').count(),0,route);
      assert.equal(requests.filter(a=>a==='heartbeat').length-before,1,'Exactly one presence mount per page');
    }
    for(const role of ['super_admin','moderator','admin','team_head','employee']){
      await page.goto(base+'/dashboard?role='+role);
      await page.getByRole('button',{name:'Start meeting',exact:true}).waitFor();
    }
    for(const [width,height] of [[320,640],[390,844],[640,800],[768,800],[900,700],[1024,768],[1365,636],[1600,900]]){
      await page.setViewportSize({width,height});
      await page.waitForTimeout(350);
      const fit=await page.locator('header').evaluate(header=>{
        const rect=header.getBoundingClientRect();
        const button=header.querySelector('[data-meeting-control]');
        const b=button.getBoundingClientRect();
        const controls=[...header.querySelectorAll('button,a')].filter(el=>el.getClientRects().length).map(el=>({text:el.textContent.trim(),x:el.getBoundingClientRect().x,right:el.getBoundingClientRect().right}));
        return {rem:parseFloat(getComputedStyle(document.documentElement).fontSize),width:innerWidth,left:rect.left,right:rect.right,scroll:document.documentElement.scrollWidth,b:{x:b.x,right:b.right,height:b.height},controls};
      });
      assert(fit.b.x>=fit.left&&fit.b.right<=fit.right+1,JSON.stringify(fit));
      assert(fit.controls.every(c=>c.x>=fit.left-1&&c.right<=fit.right+1),JSON.stringify(fit));
      assert(fit.scroll<=width,JSON.stringify(fit));
      assert(fit.b.height+1>=(width<900?44:2.25*fit.rem),JSON.stringify(fit));
    }

    async function checkContrast(state) {
      const colors=await page.locator('[data-meeting-control]').evaluate(button=>{
        const style=getComputedStyle(button),icon=getComputedStyle(button.querySelector('svg'));
        const values=color=>color.match(/[\d.]+/g).map(Number);
        const luminance=color=>{const c=values(color).slice(0,3).map(n=>{n/=255;return n<=0.04045?n/12.92:((n+0.055)/1.055)**2.4;});return c[0]*0.2126+c[1]*0.7152+c[2]*0.0722;};
        const bg=style.backgroundColor,fg=style.color,a=luminance(bg),b=luminance(fg);
        return {text:fg,icon:icon.color,background:bg,alpha:values(bg)[3]??1,contrast:(Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)};
      });
      assert.equal(colors.text,'rgb(255, 255, 255)',state+': white text');
      assert.equal(colors.icon,'rgb(255, 255, 255)',state+': white icon');
      assert.equal(colors.alpha,1,state+': solid fill');
      assert(colors.contrast>=4.5,state+': '+JSON.stringify(colors));
    }
    const artifacts=path.join(root,'.next/header-meeting-check');fs.mkdirSync(artifacts,{recursive:true});
    async function checkThemes(state) {
      await page.setViewportSize({width:1365,height:636});
      for(const theme of ['light','dark']){
        await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
        await page.mouse.move(500,200);await page.waitForTimeout(180);
        await checkContrast(theme+' '+state);
        await page.screenshot({path:path.join(artifacts,state+'-'+theme+'.png'),clip:{x:0,y:0,width:1365,height:110}});
        await page.locator('[data-meeting-control]').hover();await page.waitForTimeout(180);
        await checkContrast(theme+' '+state+' hover');
        await page.mouse.down();await checkContrast(theme+' '+state+' pressed');
        await page.mouse.move(500,200);await page.mouse.up();
      }
      await page.evaluate(()=>document.documentElement.dataset.theme='light');
    }
    const startColors=await page.locator('[data-meeting-control]').evaluate(button=>({text:getComputedStyle(button).color,icon:getComputedStyle(button.querySelector('svg')).color}));
    assert.deepEqual(startColors,{text:'rgb(255, 255, 255)',icon:'rgb(255, 255, 255)'},'Meeting label and icon must remain white in the actual light theme');
    await checkThemes('start');
    await page.getByRole('button',{name:'Start meeting',exact:true}).click();
    await page.getByRole('button',{name:'End meeting',exact:true}).waitFor();
    assert(meeting);
    await checkThemes('active');
    await page.goto(base+'/management');
    await page.getByRole('button',{name:'End meeting',exact:true}).waitFor();
    failNext=true;
    await page.getByRole('button',{name:'End meeting',exact:true}).click();
    await page.getByText('Synthetic meeting save rejected',{exact:true}).waitFor();
    assert(meeting,'A rejected End must preserve meeting status');
    assert.equal(await page.getByRole('button',{name:'End meeting',exact:true}).getAttribute('aria-pressed'),'true');
    await page.getByRole('button',{name:'End meeting',exact:true}).click();
    await page.getByRole('button',{name:'Start meeting',exact:true}).waitFor();
    assert.equal(meeting,null);
    await page.getByRole('button',{name:'Start meeting',exact:true}).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button',{name:'End meeting',exact:true}).waitFor();
    await page.evaluate(()=>localStorage.setItem('worklog-sidebar-pinned','true'));
    await page.goto(base+'/management?role=super_admin');
    await page.getByRole('button',{name:'End meeting',exact:true}).waitFor();
    await page.waitForTimeout(450);
    const clockFit=await page.locator('[data-meeting-control]').evaluate(button=>{
      const clock=button.previousElementSibling,rect=clock.getBoundingClientRect();
      return {clockRight:rect.right,buttonLeft:button.getBoundingClientRect().left,content:clock.scrollWidth,width:clock.clientWidth};
    });
    assert(clockFit.clockRight<=clockFit.buttonLeft&&clockFit.content<=clockFit.width+1,JSON.stringify(clockFit));
    assert.deepEqual(errors,[]);
    await page.setViewportSize({width:1365,height:636});await page.screenshot({path:path.join(artifacts,'desktop.png'),clip:{x:0,y:0,width:1365,height:110}});
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(artifacts,'mobile.png')});
    console.log('PASS one header-only meeting control, all five roles, responsive 320–1600px, heartbeat, Start/End, navigation state, failed save and keyboard access');
  } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
