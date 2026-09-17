// Verify the real component inside a representative header/sidebar/main shell.
const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async function layoutChecks(browser,base,out,errors,fixture){
 for(const [width,height] of [[1600,900],[1365,768],[1365,600],[1365,560],[1280,720],[390,844]]){
  const page=await browser.newPage({viewport:{width,height}});
  page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto(base);await page.getByRole('heading',{name:'Management Dashboard',exact:true}).waitFor();
   await page.waitForTimeout(300);
   assert.equal(await page.getByText('Screen Monitoring',{exact:true}).count(),0);
   assert.equal(await page.locator('.dashboard-monitor-strip').count(),0);
   const attendanceChart=await page.locator("#attendance-summary [role=img]").evaluate(element=>element.style.background);
   assert.match(attendanceChart,/241, 162, 59|#f1a23b/i,"Late must have an orange donut segment");
   assert.match(attendanceChart,/62\.5%/,"On-time Present excludes the Late segment");
   assert.match(attendanceChart,/75%/,"Present includes Late in the donut");
   const typography=await page.evaluate(()=>{
    const root=document.querySelector('[data-management-dashboard]');
    const smallText=[...root.querySelectorAll('*')].filter(el=>
     !el.closest('svg')&&!String(el.className).includes('avatar')&&
     [...el.childNodes].some(node=>node.nodeType===Node.TEXT_NODE&&node.textContent.trim())&&
     parseFloat(getComputedStyle(el).fontSize)<9
    ).map(el=>({text:el.textContent.slice(0,50),size:getComputedStyle(el).fontSize}));
    const font=selector=>parseFloat(getComputedStyle(root.querySelector(selector)).fontSize);
    const titleElement=root.querySelector('h1');
    return {smallText,title:parseFloat(titleElement.style.fontSize||getComputedStyle(titleElement).fontSize),task:font('[data-scroll-table] tbody td:nth-child(2)>a'),input:font('input[name="q"]')};
   });
   assert.deepEqual(typography.smallText,[],'No dashboard content text below 9px (badges), with body text tested separately');
   assert(typography.title===18&&typography.task>=11&&typography.task<=12&&typography.input>=11&&typography.input<=12,`Modest font increase at ${width}x${height}: `+JSON.stringify(typography));

   async function fit(){
    const result=await page.evaluate(()=>{
     const root=document.querySelector('[data-management-dashboard]');
     const panels=[...root.querySelectorAll('section')];
     const inlineFields=[...root.querySelectorAll('[data-task-status]>span,[data-task-updated]>time,[data-task-time]')];
     return {
      horizontal:document.documentElement.scrollWidth>innerWidth+1,
      inlineClipping:inlineFields.filter(el=>el.getBoundingClientRect().width>el.parentElement.clientWidth-8+1).map(el=>el.textContent),
      wrappedFields:inlineFields.filter(el=>el.getBoundingClientRect().height>parseFloat(getComputedStyle(el).lineHeight)+1).map(el=>el.textContent),
      horizontalTables:[...root.querySelectorAll('[data-scroll-table]')].filter(el=>el.scrollWidth>el.clientWidth+1).map(el=>el.getAttribute('aria-label')),
      documentHeight:document.documentElement.scrollHeight,
      viewportHeight:innerHeight,
      rootBottom:root.getBoundingClientRect().bottom,
      panelOverflow:panels.filter(panel=>[...panel.querySelectorAll('table,a,button')].some(child=>{
       const a=(child.closest('[data-scroll-table], [data-live-scroll]')||child).getBoundingClientRect(),b=panel.getBoundingClientRect();
       return a.width&&a.height&&(a.bottom>b.bottom+2||a.right>b.right+2);
      })).map(panel=>panel.getAttribute('aria-label')||panel.id||panel.textContent.slice(0,50)),
      scrollContainers:[...document.querySelectorAll('.dashboard-scroll, [data-management-dashboard] *')].filter(el=>{
       if(el.matches('[data-scroll-table], [data-live-scroll]'))return false;const css=getComputedStyle(el);return (/auto|scroll/.test(css.overflowY)&&el.scrollHeight>el.clientHeight+1)||(/auto|scroll/.test(css.overflowX)&&el.scrollWidth>el.clientWidth+1);
      }).map(el=>el.className),
      bottomStrip:root.getBoundingClientRect().bottom
     };
    });
    assert.equal(result.horizontal,false,JSON.stringify(result));
    assert.deepEqual(result.wrappedFields,[],'Status/priority and updated date/time stay on one line');
    if(width>=1100&&height>=560){
     assert(result.documentHeight<=height+1,JSON.stringify(result));
     assert(result.bottomStrip<=height+1,JSON.stringify(result));
     assert.deepEqual(result.panelOverflow,[],JSON.stringify(result));
     assert.deepEqual(result.inlineClipping,[],'Inline fields remain readable with either sidebar width: '+JSON.stringify(result));
     assert.deepEqual(result.horizontalTables,[],'All desktop table columns fit, including when the sidebar expands: '+JSON.stringify(result));
     assert.deepEqual(result.scrollContainers,[],JSON.stringify(result));
    }
   }
   await fit();
   assert.equal(await page.locator('#live-team [data-kind]').count(),3,'Live team has exactly three KPI cards');
   assert.deepEqual(await page.locator('#live-team [data-kind] span').allTextContents(),['Available','Task running','In meeting']);
   assert.equal(await page.locator('#live-team tbody tr').count(),fixture.live.length,'All Live team employees are in the scrollable table');
   const taskRows=page.locator('table').first().locator('tbody tr');
   assert.equal(await taskRows.locator('td:nth-child(2) small,td:nth-child(7) small').count(),0,'Project/client and estimate sublines are removed even when populated');
   assert.equal(await taskRows.locator('[data-task-status] small,[data-task-updated] small').count(),0,'No stacked status or update fields');
   const firstTask=fixture.taskRows[0];
   assert.match(await taskRows.locator('[data-task-status]').first().innerText(),/Completed\s*\/\s*High/i);
   assert.match(await taskRows.locator('[data-task-updated]').first().innerText(),/13 Sep\s*\/\s*06:00 pm/i);
   assert.equal(await taskRows.locator('[data-task-updated] time').first().getAttribute('datetime'),firstTask.lastUpdate,'Updated time keeps the source timestamp');
   assert.match(await taskRows.locator('[data-task-time]').nth(0).innerText(),/1:20\s*\/\s*4:00/,'Tracked and estimated time share one compact line');
   assert.equal(await taskRows.locator('[data-task-time][data-over-estimate="true"]').count(),1,'Over-estimate work is visibly flagged');
   assert((await taskRows.locator('[data-task-time]').allTextContents()).includes('1:22'),'Missing estimates do not render a meaningless placeholder');
   const all=await taskRows.locator('td:nth-child(2)>a').allTextContents();
   assert.equal(all.length,14);assert.equal(new Set(all).size,14,'All task records render without pagination');
   for(const name of ['Next task page','Previous task page','Next employee summary page','Next department summary page']){
    assert.equal(await page.getByRole('button',{name,exact:true}).count(),0);
   }
   assert.equal(await page.getByRole('region',{name:'Employee summary table',exact:true}).locator('tbody tr').count(),8);
   assert.equal(await page.getByRole('region',{name:'Department summary table',exact:true}).locator('tbody tr').count(),2);
   for(const name of ['Task table','Employee summary table','Department summary table']){
    const area=page.getByRole('region',{name,exact:true});
    const metrics=await area.evaluate(el=>{
     el.scrollTop=el.scrollHeight;el.scrollLeft=0;
     const box=el.getBoundingClientRect(),head=el.querySelector('th').getBoundingClientRect(),last=el.querySelector('tbody tr:last-child').getBoundingClientRect();
     return {scrollTop:el.scrollTop,canScroll:el.scrollHeight>el.clientHeight+1,headTop:head.top,top:box.top,lastBottom:last.bottom,bottom:box.bottom,cellBorder:getComputedStyle(el.querySelector('td')).borderRightWidth};
    });
    assert.equal(metrics.cellBorder,'1px','Visible column borders');
    assert(Math.abs(metrics.headTop-metrics.top)<=2,'Sticky header remains visible: '+name);
    if(width>=1100&&height>=560)assert(Math.abs(metrics.lastBottom-metrics.bottom)<=3,'No blank bottom gap: '+JSON.stringify(metrics));
    await area.evaluate(el=>el.scrollTop=0);
   }
   const taskArea=page.getByRole('region',{name:'Task table',exact:true});
   await taskArea.evaluate(el=>el.scrollTop=80);
   await page.getByLabel('Sort tasks').selectOption('employee');
   assert.equal(await taskArea.evaluate(el=>el.scrollTop),0,'Sorting resets only the task scroller');
   await page.locator('summary').filter({hasText:'Export'}).click();
   assert((await page.getByRole('link',{name:'PDF',exact:true}).getAttribute('href')).includes('format=pdf'));
   await page.locator('summary').filter({hasText:'Export'}).click();
   assert.equal(await page.getByRole('button',{name:'Next live team page',exact:true}).count(),0,'Live team uses scrolling instead of pagination');
   const liveArea=page.getByRole('region',{name:'Live team employees',exact:true});
   const liveScroll=await liveArea.evaluate(el=>{
    const canScroll=el.scrollHeight>el.clientHeight+1;
    el.scrollTop=el.scrollHeight;
    const box=el.getBoundingClientRect(),header=el.querySelector('th').getBoundingClientRect();
    return {canScroll,top:el.scrollTop,headerTop:header.top,boxTop:box.top};
   });
   if(width>=1100&&height<=600)assert(liveScroll.canScroll&&liveScroll.top>0,'Live team table scrolls on compact desktop screens');
   if(liveScroll.canScroll)assert(Math.abs(liveScroll.headerTop-liveScroll.boxTop)<=2,'Live team header stays visible while scrolling');
   await fit();
   await page.screenshot({path:path.join(out,'dashboard-'+width+'x'+height+'.png'),fullPage:true});
   if(width>=1100&&height>=560){
    await page.getByRole('button',{name:'Toggle fixture sidebar'}).click();await page.waitForTimeout(300);await fit();
    await page.screenshot({path:path.join(out,'dashboard-'+width+'x'+height+'-expanded.png'),fullPage:true});
   }
   console.log('PASS viewport fit, bordered scroll tables, sticky headers, live scrolling, sort and export',width,height);
  }finally{await page.close();}
 }
 for(const [variant,count] of [['five',5],['seven',7]]){
  const sample=await browser.newPage({viewport:{width:1365,height:640}});
  try{
   await sample.goto(base+'/?'+variant);
   await sample.locator('#live-team tbody tr').last().waitFor();
   await sample.waitForTimeout(150);
   const metrics=await sample.locator('[data-live-scroll]').evaluate(el=>({bar:el.getAttribute('data-scrollbar'),delta:Math.round(el.querySelector('table').getBoundingClientRect().height-el.clientHeight),rows:el.querySelectorAll('tbody tr').length}));
   assert.equal(metrics.rows,count);
   assert.equal(metrics.bar,variant==='five'?'false':'true','Scrollbar appears only when another employee exceeds the available space');
  }finally{await sample.close();}
 }
 const page=await browser.newPage({viewport:{width:1365,height:600}});
 page.setDefaultTimeout(10000);
 try{
  const departments=Array.from({length:24},(_,i)=>({...fixture.departments[i%2],id:'department-'+i,name:'Department '+String(i+1).padStart(2,'0')}));
  await page.route('**/api/management/dashboard?*',route=>route.fulfill({json:{...fixture,departments}}));
  await page.goto(base);await page.getByRole('heading',{name:'Management Dashboard',exact:true}).waitFor();
  const response=page.waitForResponse(r=>r.url().includes('/api/management/dashboard?'));
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await response;
  const area=page.getByRole('region',{name:'Department summary table',exact:true});
  await area.locator('tbody tr').last().getByText('Department 24',{exact:true}).waitFor({state:'attached'});
  assert.equal(await area.locator('tbody tr').count(),24);
  await area.focus();await page.keyboard.press('End');await page.waitForTimeout(150);
  const metrics=await area.evaluate(el=>({position:el.scrollTop,head:el.querySelector('th').getBoundingClientRect().top,top:el.getBoundingClientRect().top,last:el.querySelector('tbody tr:last-child').getBoundingClientRect().bottom,bottom:el.getBoundingClientRect().bottom,outer:document.querySelector('.dashboard-scroll').scrollTop}));
  assert(metrics.position>0,'Department table supports keyboard scrolling');
  assert(Math.abs(metrics.head-metrics.top)<=2,'Department header stays pinned');
  assert(Math.abs(metrics.last-metrics.bottom)<=3,'Last department is reachable without a bottom gap');
  assert.equal(metrics.outer,0,'Scrolling a table never scrolls the desktop dashboard');
  console.log('PASS all 24 departments, keyboard scrolling and fixed outer dashboard');
 }finally{await page.close();}

};
