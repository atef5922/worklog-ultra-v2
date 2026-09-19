// Run with the local Next dev server up: node scripts/check-sidebar.cjs
// Tests the real component/CSS with synthetic users in a separate headless profile.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const esbuild = require('esbuild');
const { chromium } = require('playwright-core');

const root = path.resolve(__dirname, '..');
const artifactDir = path.join(root, '.next/sidebar-check');
const appUrl = process.env.APP_URL || 'http://localhost:3000';

async function run() {
  fs.mkdirSync(artifactDir, {recursive:true});
  const sourceHtml = await (await fetch(appUrl + '/auth/login')).text();
  const styles = [...sourceHtml.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)].map(match => /href="([^"]+)"/.exec(match[0])?.[1]).filter(Boolean);
  assert(styles.length, 'Could not find actual application CSS');
  const htmlClass = /<html[^>]*class="([^"]+)"/.exec(sourceHtml)?.[1] || '';
  const bundle = await esbuild.build({
    entryPoints: [path.join(__dirname,'sidebar-check/entry.tsx')], bundle:true, write:false, format:'iife', platform:'browser', jsx:'automatic',
    define:{'process.env.NODE_ENV':'"development"'},
    alias:{'next/navigation':path.join(__dirname,'sidebar-check/navigation.ts'),'next/link':path.join(__dirname,'sidebar-check/link.tsx')},
  });
  const server = http.createServer((req,res) => {
    if (req.url==='/fixture.js') {res.setHeader('content-type','text/javascript');res.end(bundle.outputFiles[0].text);return;}
    if(req.url.startsWith('/api/')) {res.setHeader('content-type','application/json');res.end('{"success":true,"notices":[]}');return;}
    res.setHeader('content-type','text/html');
    res.end(`<!doctype html><html class="${htmlClass}" data-sidebar-collapsed="true"><head>${styles.map(href=>`<link rel="stylesheet" href="${appUrl}${href}">`).join('')}</head><body><div id="root"></div><script src="/fixture.js"></script></body></html>`);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser = await chromium.launch({channel:'msedge',headless:true});
  const base=`http://127.0.0.1:${server.address().port}`;
  const errors=[];
  async function testPage(width,height,query='',pinned=true) {
    const context=await browser.newContext({viewport:{width,height}});
    const page=await context.newPage();
    page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(value=>localStorage.setItem('worklog-sidebar-pinned',String(value)),pinned);
    await page.goto(base+'/?'+query);
    await page.locator('.sidebar-content').first().waitFor({state:'attached'});
    await page.waitForTimeout(550);
    return {page,context};
  }
  async function checkFit(page,selector) {
    const data=await page.locator(selector).evaluate(sidebar=>{
      const region=sidebar.querySelector('.sidebar-navigation-region');
      const nav=sidebar.querySelector('nav');
      const footer=sidebar.querySelector('.sidebar-footer');
      const rows=[...nav.querySelectorAll('[data-sidebar-row]')];
      return {
        height:innerHeight, footerBottom:footer.getBoundingClientRect().bottom,
        regionHeight:region.clientHeight,regionScroll:region.scrollHeight,
        navHeight:nav.clientHeight,navScroll:nav.scrollHeight,overflow:getComputedStyle(nav).overflowY,
        rows:rows.map(row=>({label:row.getAttribute('title'),height:row.getBoundingClientRect().height,top:row.getBoundingClientRect().top,bottom:row.getBoundingClientRect().bottom})),
      };
    });
    assert(data.footerBottom<=data.height+1,JSON.stringify(data));
    assert(data.regionScroll<=data.regionHeight+1,JSON.stringify(data));
    assert(data.navScroll<=data.navHeight+1,JSON.stringify(data));
    assert.equal(data.overflow,'clip');
    assert(data.rows.every(row=>row.height>=29.5),JSON.stringify(data));
    return data;
  }
  try {
    for(const [width,height] of [[1365,636],[1280,560],[1920,900],[1365,320]]) {
      const {page,context}=await testPage(width,height,'pathname=/management');
      assert.equal(await page.locator('html').getAttribute('data-sidebar-collapsed'),'true','Every desktop load must start collapsed');
      assert.equal(await page.locator('.dashboard-sidebar [data-sidebar-subitem]').count(),0,'Management submenu must start collapsed');
      await page.locator('.dashboard-sidebar [data-sidebar-toggle]').click();
      await page.waitForTimeout(500);
      await page.getByRole('button',{name:'Management'}).click();
      await page.waitForTimeout(420);
      const data=await checkFit(page,'.dashboard-sidebar');
      if(data.rows.length<14) {
        const seen=new Set(data.rows.map(row=>row.label));
        const more=page.locator('.dashboard-sidebar .sidebar-navigation-pager button');
        for(let i=0;i<6&&seen.size<14;i++) {await more.click();await page.waitForTimeout(420);const next=await checkFit(page,'.dashboard-sidebar');next.rows.forEach(row=>seen.add(row.label));}
        assert.equal(seen.size,14,'Every expanded Super Admin menu must remain reachable');
      }
      if(width===1365&&height===636) {
        const expandedRail=await page.locator('.dashboard-sidebar').boundingBox();
        assert(expandedRail.width<=205&&expandedRail.width>=190,`Expanded sidebar should remain compact: ${expandedRail.width}px`);
        const clipped=await page.locator('.dashboard-sidebar nav [data-sidebar-label]').evaluateAll(labels=>labels.filter(label=>label.scrollWidth>label.clientWidth+1).map(label=>label.textContent));
        assert.deepEqual(clipped,[],'Expanded navigation labels should fit');
        await page.screenshot({path:path.join(artifactDir,'desktop-expanded.png')});
      }
      console.log('PASS desktop fit',width,height,'visible menu rows',data.rows.length);
      await context.close();
    }
    {
      const {page,context}=await testPage(1365,636,'',false);
      const sidebar=page.locator('.dashboard-sidebar');
      const toggle=sidebar.locator('[data-sidebar-toggle]');
      const dashboardIcon=await sidebar.locator('a[title="Dashboard"] svg').first().boundingBox();
      const managementIcon=await sidebar.getByRole('button',{name:'Management'}).locator('svg').first().boundingBox();
      assert(Math.abs((dashboardIcon.x+dashboardIcon.width/2)-(managementIcon.x+managementIcon.width/2))<1,'Collapsed Management icon must share the main icon center line');
      await toggle.hover();await page.waitForTimeout(400);
      assert.equal(await page.locator('html').getAttribute('data-sidebar-peek'),'false','Toggle hover must not expand');
      const iconBefore=await sidebar.locator('nav svg').first().boundingBox();
      await sidebar.locator('nav a').first().hover();
      await page.waitForFunction(()=>document.documentElement.dataset.sidebarPeek==='true');
      await page.waitForTimeout(450);
      const iconExpanded=await sidebar.locator('nav svg').first().boundingBox();
      assert(Math.abs(iconBefore.x-iconExpanded.x)<1,'Icon lane must stay steady');
      const inactiveManagementStyle=await sidebar.getByRole('button',{name:'Management'}).evaluate(element=>({
        backgroundColor:getComputedStyle(element).backgroundColor,
        backgroundImage:getComputedStyle(element).backgroundImage,
      }));
      assert.equal(inactiveManagementStyle.backgroundColor,'rgba(0, 0, 0, 0)','Inactive Management must remain transparent');
      assert.equal(inactiveManagementStyle.backgroundImage,'none','Inactive Management must not retain an active fill');
      const rail=await sidebar.boundingBox();const main=await page.locator('main').boundingBox();
      assert(Math.abs(rail.width-main.x)<1,'Content must fit the expanded sidebar');
      await sidebar.getByRole('button',{name:'Management'}).click();
      await page.waitForTimeout(420);
      assert((await sidebar.locator('[data-sidebar-subitem]').count())>0,'Expanded Management must show submenu rows');
      await page.mouse.move(700,250);await page.waitForTimeout(650);
      assert.equal(await page.locator('html').getAttribute('data-sidebar-peek'),'false');
      assert.equal(await sidebar.locator('[data-sidebar-subitem]').count(),0,'Collapsed sidebar must hide submenu rows');
      await sidebar.locator('nav a').first().hover();
      await page.waitForFunction(()=>document.documentElement.dataset.sidebarPeek==='true');
      await page.waitForTimeout(250);
      assert.equal(await sidebar.locator('[data-sidebar-subitem]').count(),0,'Re-expanded sidebar must keep Management collapsed');
      await page.mouse.move(700,250);await page.waitForTimeout(650);
      await toggle.click();await page.mouse.move(700,250);await page.waitForTimeout(450);
      assert.equal(await page.locator('html').getAttribute('data-sidebar-pinned'),'true');
      assert.equal(await sidebar.locator('[data-sidebar-subitem]').count(),0,'Pinned expansion must keep Management collapsed');
      await sidebar.getByRole('button',{name:'Management'}).click();await page.waitForTimeout(420);
      assert((await sidebar.locator('[data-sidebar-subitem]').count())>0,'Management must still expand on an explicit click');
      const reportLink=sidebar.locator('a[href="/dashboard/report"]');
      await reportLink.evaluate(link=>link.addEventListener('click',event=>event.preventDefault(),{once:true}));
      await reportLink.click();await page.waitForTimeout(420);
      assert.equal(await sidebar.locator('[data-sidebar-subitem]').count(),0,'Another main-menu click must collapse Management');
      await sidebar.getByRole('button',{name:'Management'}).click();await page.waitForTimeout(420);
      assert((await sidebar.locator('[data-sidebar-subitem]').count())>0,'Management must reopen after navigation reset');
      await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.mouse.move(700,250);await page.waitForTimeout(450);
      assert.equal(await page.locator('html').getAttribute('data-sidebar-pinned'),'false','Window blur must clear the pinned expansion');
      assert.equal(await page.locator('html').getAttribute('data-sidebar-collapsed'),'true');
      assert.equal(await sidebar.locator('[data-sidebar-subitem]').count(),0,'Window blur must collapse Management submenu rows');
      await sidebar.locator('nav a').first().hover();
      await page.waitForFunction(()=>document.documentElement.dataset.sidebarPeek==='true');
      await page.waitForTimeout(300);
      assert.equal(await sidebar.locator('[data-sidebar-subitem]').count(),0,'Hover re-expansion after pin collapse must keep Management collapsed');
      await page.mouse.move(700,250);await page.waitForTimeout(650);
      await page.screenshot({path:path.join(artifactDir,'desktop-collapsed.png')});
      console.log('PASS hover, collapse, stable icons, toggle exclusion, pin and content fit');
      await context.close();
    }
    for (const [role,count] of [['employee',6],['team_head',7],['admin',6],['moderator',6]]) {
      const {page,context}=await testPage(1365,636,`role=${role}&management=false`);
      const data=await checkFit(page,'.dashboard-sidebar');assert.equal(data.rows.length,count);
      assert(!data.rows.some(row=>row.label==='Attendance'),role+' must not get management attendance without access');
      console.log('PASS role-aware menu',role);await context.close();
    }
    for (const role of ['employee','team_head','admin','moderator']) {
      const {page,context}=await testPage(1365,636,`role=${role}&management=true&attendance=true&pathname=/management/attendance`);
      await page.locator('.dashboard-sidebar [data-sidebar-toggle]').click();
      await page.waitForTimeout(500);
      const managementButton=page.getByRole('button',{name:'Management'});
      if(await managementButton.count()) {await managementButton.click();await page.waitForTimeout(420);}
      const attendance=page.locator('.dashboard-sidebar nav a[href="/management/attendance"]');
      assert.equal(await attendance.count(),role==='employee'?0:1,role+' attendance access');
      await context.close();
    }
    for(const [width,height] of [[390,844],[375,640],[844,390]]) {
      const {page,context}=await testPage(width,height,'pathname=/management');
      await page.getByRole('button',{name:'Open navigation menu'}).click();
      await page.waitForTimeout(300);
      const selector='.sidebar-content[data-sidebar-mobile="true"]';
      assert.equal(await page.locator(selector+' [data-sidebar-subitem]').count(),0,'Mobile Management submenu must start collapsed');
      await page.locator(selector).getByRole('button',{name:'Management'}).click();
      await page.waitForTimeout(420);
      const data=await checkFit(page,selector);
      assert(data.rows.every(row=>row.height>=43),'Mobile touch targets must not shrink');
      const seen=new Set(data.rows.map(row=>row.label));
      const more=page.locator(selector+' .sidebar-navigation-pager button');
      for(let i=0;i<8&&seen.size<14;i++) {await more.click();await page.waitForTimeout(420);const next=await checkFit(page,selector);next.rows.forEach(row=>seen.add(row.label));}
      assert.equal(seen.size,14,'Every expanded mobile menu should be reachable');
      if(width===375) await page.screenshot({path:path.join(artifactDir,'mobile.png')});
      console.log('PASS mobile fit and menu reachability',width,height);await context.close();
    }
    assert.deepEqual(errors,[],'Browser console errors');
    console.log('PASS all sidebar browser checks. Screenshots: .next/sidebar-check');
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
}
run().catch(error=>{console.error(error);process.exitCode=1});
