// Real dashboard component, synthetic read-only API responses.
const assert=require('node:assert/strict');
module.exports=async function checkFilters(browser,base,fixture){
 const page=await browser.newPage({viewport:{width:1365,height:768}}),requests=[],errors=[];
 page.setDefaultTimeout(10000);page.setDefaultNavigationTimeout(10000);
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/management/dashboard?*',async route=>{
  const query=new URL(route.request().url()).searchParams;
  requests.push(Object.fromEntries(query));
  if(query.get('q')==='offline'){
   await route.fulfill({status:503,json:{message:'Synthetic filter unavailable.'}});return;
  }
  if(query.get('priority')==='high')await new Promise(resolve=>setTimeout(resolve,450));
  const taskRows=fixture.taskRows.filter(task=>
   (!query.get('userId')||task.userId===query.get('userId'))&&
   (!query.get('departmentId')||task.departmentId===query.get('departmentId'))&&
   (!query.get('taskStatus')||task.status===query.get('taskStatus'))&&
   (!query.get('priority')||task.priority===query.get('priority'))&&
   (!query.get('q')||task.title.toLowerCase().includes(query.get('q').toLowerCase())));
  await route.fulfill({json:{...fixture,from:query.get('from')||fixture.from,to:query.get('to')||fixture.to,
   taskRows,kpis:{...fixture.kpis,tasks:taskRows.length,completed:taskRows.filter(t=>t.status==='done').length,
   inProgress:taskRows.filter(t=>t.status==='in_progress').length,pending:taskRows.filter(t=>t.status==='pending').length}}});
 });
 try{
  await page.goto(base);await page.getByRole('heading',{name:'Management Dashboard',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Apply filters'}).count(),0);
  assert.equal(await page.getByRole('region',{name:'Requires attention'}).count(),0);
  const kpi=page.locator('section').filter({has:page.getByRole('heading',{name:'Total employees',exact:true})});
  assert((await kpi.boundingBox()).height<=76,'KPI cards must stay compact');
  const taskArea=page.getByRole('region',{name:'Task table',exact:true});
  await taskArea.evaluate(el=>el.scrollTop=el.scrollHeight);
  async function apply(label,name,value,type='select'){
   const field=page.getByLabel(label,{exact:true});
   if(type==='select')await field.selectOption(value);else await field.fill(value);
   await page.waitForURL(url=>url.searchParams.get(name)===value);
   assert.equal(requests.at(-1)[name],value);
  }
  await apply('Employee','userId','employee-2');
  assert.equal(await taskArea.evaluate(el=>el.scrollTop),0,'Filters reset scroll position');
  await apply('Department','departmentId','development');
  await apply('From','from','2026-09-12','input');
  await apply('To','to','2026-09-14','input');
  await apply('Status','taskStatus','pending');
  await apply('Priority','priority','low');
  const beforeSearch=requests.length;
  await page.getByLabel('Search',{exact:true}).pressSequentially('Prepare client',{delay:20});
  await page.waitForURL(url=>url.searchParams.get('q')==='Prepare client');
  assert.equal(requests.length-beforeSearch,1,'Search must be debounced');
  assert(await page.getByLabel('Search',{exact:true}).evaluate(el=>el===document.activeElement),'Typing keeps focus');
  assert.equal(await page.locator('table').first().locator('tbody tr').count(),1);
  await page.locator('summary').filter({hasText:'Export'}).click();
  const exportUrl=new URL(await page.getByRole('link',{name:'PDF',exact:true}).getAttribute('href'),base);
  for(const [key,value] of Object.entries(requests.at(-1)))assert.equal(exportUrl.searchParams.get(key),value);
  await page.locator('summary').filter({hasText:'Export'}).click();
  await page.getByRole('button',{name:'Reset',exact:true}).click();
  await page.waitForURL(url=>!url.searchParams.has('q')&&!url.searchParams.has('priority'));
  assert.equal(await page.getByLabel('Search',{exact:true}).inputValue(),'');
  assert.equal(await page.getByLabel('Employee',{exact:true}).inputValue(),'');
  assert((await page.locator('table').first().locator('tbody tr').count())>0);
  await taskArea.evaluate(el=>el.scrollTop=80);
  const scrollBeforeRefresh=await taskArea.evaluate(el=>el.scrollTop);
  const background=page.waitForResponse(response=>response.url().includes('/api/management/dashboard?'));
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await background;
  await page.waitForFunction(()=>!document.querySelector('[role="status"]').textContent.includes('Updating'));
  assert.equal(await taskArea.evaluate(el=>el.scrollTop),scrollBeforeRefresh,'Background refresh preserves scroll position');
  const highRequest=page.waitForRequest(request=>new URL(request.url()).searchParams.get('priority')==='high');
  await page.getByLabel('Priority',{exact:true}).selectOption('high');await highRequest;
  await apply('Priority','priority','low');
  await page.waitForTimeout(550);
  assert.equal(new URL(page.url()).searchParams.get('priority'),'low');
  assert((await page.locator('table').first().locator('[data-priority]').allTextContents()).every(text=>text.startsWith('low')),'Late old responses never replace newer results');
  const rowsBefore=await page.locator('table').first().locator('tbody').textContent(),urlBefore=page.url();
  await page.getByLabel('Search',{exact:true}).fill('offline');
  await page.getByRole('status').filter({hasText:'Synthetic filter unavailable.'}).waitFor();
  assert.equal(await page.locator('table').first().locator('tbody').textContent(),rowsBefore);
  assert.equal(page.url(),urlBefore,'Failed filters do not change the applied URL');
  await page.getByLabel('Search',{exact:true}).fill('');
  await page.getByRole('status').filter({hasText:'Updated'}).waitFor();
  const count=requests.length;
  await page.getByLabel('From',{exact:true}).fill('2026-10-01');
  await page.getByText(/From date must not be after To date/).waitFor();
  await page.waitForTimeout(100);assert.equal(requests.length,count,'Invalid date ranges never issue a query');
  await apply('To','to','2026-10-02','input');
  assert.equal(requests.at(-1).from,'2026-10-01');
  assert.deepEqual(errors,[]);
  console.log('PASS all seven automatic filters, debounce, scroll position, reset, exports, stale-response protection and error recovery');
 }finally{await page.close();}
};
