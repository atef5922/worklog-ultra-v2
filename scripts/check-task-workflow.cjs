// Real React components and shared client workflow; synthetic transport, no login or database writes.
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const esbuild = require('esbuild');
const { chromium } = require('playwright-core');

async function run() {
  const root = path.resolve(__dirname, '..');
  const bundle = await esbuild.build({ entryPoints: [path.join(__dirname, 'task-workflow-check/entry.tsx')], bundle: true, write: false,
    platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' },
    alias: { 'next/link': path.join(__dirname, 'sidebar-check/link.tsx'), 'next/navigation': path.join(__dirname, 'task-workflow-check/navigation.ts') } });
  const html = await (await fetch('http://localhost:3000/auth/login')).text();
  const css = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)].map(m => /href="([^"]+)"/.exec(m[0])?.[1]).filter(Boolean);
  const server = http.createServer((req, res) => {
    if (req.url === '/fixture.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(bundle.outputFiles[0].text); }
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!doctype html><html><head>${css.map(h => `<link rel="stylesheet" href="http://localhost:3000${h}">`).join('')}<style>body{padding:24px;background:#f1f5fb}button{cursor:pointer}</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const errors = [], base = `http://127.0.0.1:${server.address().port}`;
  const fail = (page, mode) => page.evaluate(mode => { window.phaseOneTest.failNext = mode; }, mode);
  const snapshot = page => page.evaluate(() => window.phaseOneTest.timer);
  try {
    await require('./task-workflow-check/stale-dialogs.cjs')({browser, base, errors});

    {
      const context = await browser.newContext({viewport: {width: 1365, height: 900}});
      try {
        const assignment = await context.newPage(), dashboard = await context.newPage();
        for (const page of [assignment, dashboard]) page.on('pageerror', e => errors.push(e.message));
        await assignment.goto(base + '/?view=assignment');
        await assignment.getByRole('button', {name: 'Start', exact: true}).waitFor();
        const draft = 'Unsaved review evidence must survive cross-tab sync';
        await assignment.getByLabel('Submission note', {exact: true}).fill(draft);
        await assignment.getByLabel('Supporting files (optional)').setInputFiles({
          name: 'evidence.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic evidence'),
        });
        await dashboard.goto(base + '/?view=dashboard');
        await dashboard.getByRole('button', {name: 'Start', exact: true}).click();
        await dashboard.getByRole('button', {name: 'Pause', exact: true}).waitFor();
        await assignment.evaluate(() => window.dispatchEvent(new Event('focus')));
        await assignment.getByRole('button', {name: 'Pause', exact: true}).waitFor();
        await dashboard.getByRole('button', {name: 'Done', exact: true}).click();
        await dashboard.getByLabel('Completion note', {exact: true}).fill('Completed from another tab');
        await dashboard.getByRole('dialog').getByRole('button', {name: 'Save', exact: true}).click();
        await dashboard.getByRole('button', {name: 'Reopen', exact: true}).waitFor();
        await assignment.bringToFront();
        await assignment.evaluate(() => window.dispatchEvent(new Event('focus')));
        await assignment.getByRole('button', {name: 'Done', exact: true}).waitFor({state: 'hidden'});
        await assignment.getByRole('button', {name: 'Reopen', exact: true}).waitFor({timeout: 5000});
        assert.equal(await assignment.getByText('Completed (100%)', {exact: true}).count(), 1);
        assert.equal(await assignment.getByRole('button', {name: 'Save Work', exact: true}).count(), 0);
        assert.equal(await assignment.getByLabel('Submission note', {exact: true}).inputValue(), draft);
        assert.equal(await assignment.getByLabel('Supporting files (optional)').evaluate(el => el.files[0]?.name), 'evidence.txt');
        // A fresh Assignment mount must also override stale server-rendered props.
        const fresh = await context.newPage();
        fresh.on('pageerror', e => errors.push(e.message));
        await fresh.goto(base + '/?view=assignment');
        await fresh.getByRole('button', {name: 'Reopen', exact: true}).waitFor();
        assert.equal(await fresh.getByText('Completed (100%)', {exact: true}).count(), 1);
        await fresh.close();
        await assignment.getByRole('button', {name: 'Reopen', exact: true}).click();
        await assignment.getByRole('dialog').getByText('Completed from another tab', {exact: true}).waitFor();
        await assignment.getByRole('dialog').getByRole('button', {name: 'Cancel', exact: true}).click();
        const noteSaves = await assignment.evaluate(() => window.phaseOneTest.requests.filter(r => r.url.endsWith('/report')).length);
        await assignment.getByRole('button', {name: 'Submit for Review', exact: true}).click();
        await assignment.waitForFunction(() => window.phaseOneTest.submitted);
        assert.equal(await assignment.evaluate(() => window.phaseOneTest.requests.filter(r => r.url.endsWith('/report')).length), noteSaves);
        assert.equal(await assignment.evaluate(() => window.phaseOneTest.requests.find(r => r.url.endsWith('/review')).body.attachments.name), 'evidence.txt');

        await dashboard.getByRole('button', {name: 'Reopen', exact: true}).click();
        await dashboard.getByLabel('Why are you reopening this task?').fill('Reopened from another tab for follow-up');
        await dashboard.getByRole('button', {name: 'Reopen Task', exact: true}).click();
        await dashboard.getByRole('button', {name: 'Resume', exact: true}).waitFor();
        await assignment.evaluate(() => window.dispatchEvent(new Event('focus')));
        await assignment.getByRole('button', {name: 'Resume', exact: true}).waitFor();
        await assignment.getByRole('button', {name: 'Save Work', exact: true}).waitFor();
        assert.equal(await assignment.getByRole('button', {name: 'Reopen', exact: true}).count(), 0);
        assert.equal(await assignment.getByLabel('Submission note', {exact: true}).inputValue(), draft);
        await assignment.evaluate(() => {window.phaseOneTest.submitted = false;});
        await assignment.getByRole('button', {name: 'Submit for Review', exact: true}).click();
        await assignment.waitForFunction(() => window.phaseOneTest.submitted);
        assert.equal(await assignment.evaluate(() => window.phaseOneTest.requests.filter(r => r.url.endsWith('/report')).length), noteSaves + 1);
        assert.equal((await snapshot(assignment)).status, 'in_progress');
        console.log('PASS cross-tab Assignment Done/Reopen, completion evidence, draft/file retention and review submission');
      } finally { await context.close(); }
    }

    {
      const context = await browser.newContext({viewport: {width: 1365, height: 900}});
      try {
        const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
        await page.goto(base + '/?view=assignment');
        await page.waitForFunction(() => !Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Save Work')?.disabled);
        const draft = 'Keep this draft while synchronization reconnects';
        await page.getByLabel('Submission note', {exact: true}).fill(draft);
        await page.evaluate(() => {window.phaseOneTest.failTimerReads = true; window.dispatchEvent(new Event('focus'));});
        await page.getByRole('status').getByText('Synthetic timer read rejected', {exact: true}).waitFor();
        for (const name of ['Start', 'Done', 'Save Work', 'Submit for Review']) {
          assert.equal(await page.getByRole('button', {name, exact: true}).isDisabled(), true, name + ' must await confirmed server state');
        }
        assert.equal(await page.getByLabel('Submission note', {exact: true}).inputValue(), draft);
        await page.evaluate(() => {window.phaseOneTest.failTimerReads = false; window.dispatchEvent(new Event('focus'));});
        await page.waitForFunction(() => !Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Save Work')?.disabled);
        await page.getByRole('button', {name: 'Save Work', exact: true}).click();
        await page.getByText('Work note saved. Timer state is unchanged.', {exact: true}).waitFor();
        assert.equal(await page.evaluate(() => window.phaseOneTest.requests.find(r => r.url.endsWith('/report')).body.note), draft);
        console.log('PASS Assignment sync failure disables writes, preserves draft and recovers');
      } finally { await context.close(); }
    }
    for (const mode of ['zero-time', 'clock-behind', 'clock-ahead']) {
      const context = await browser.newContext({viewport: {width: 1365, height: 900}});
      try {
        const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
        await page.goto(base + '/?view=dashboard');
        if (mode !== 'zero-time') {
          await page.getByRole('button', {name: 'Start', exact: true}).click();
          await page.getByRole('button', {name: 'Pause', exact: true}).waitFor();
          await page.evaluate(mode => {Date.now = () => mode === 'clock-behind' ? 0 : 2208988800000;}, mode);
        }
        await page.getByRole('button', {name: 'Done', exact: true}).click();
        await page.getByLabel('Completion note', {exact: true}).fill('Timestamp regression: ' + mode);
        await page.getByRole('dialog').getByRole('button', {name: 'Save', exact: true}).click();
        await page.getByRole('button', {name: 'Reopen', exact: true}).waitFor();
        const saved = await snapshot(page);
        const display = iso => new Intl.DateTimeFormat('en-BD', {hour:'numeric',minute:'2-digit',hour12:true,timeZone:'Asia/Dhaka'}).format(new Date(iso));
        const cells = page.getByRole('row').last().getByRole('cell');
        assert.equal((await cells.nth(8).innerText()).trim(), display(saved.actualEnd), 'Saved completion time must be visible');
        assert.equal((await cells.nth(7).innerText()).trim(), saved.actualStart ? display(saved.actualStart) : '--:--');
        await page.getByRole('button', {name: 'Reopen', exact: true}).click();
        await page.getByRole('dialog').getByText(display(saved.actualEnd), {exact: true}).waitFor();
        if (mode === 'zero-time') {
          assert.equal(saved.actualStart, null);
          assert.equal(saved.trackedMilliseconds, 0);
        }
        console.log('PASS completed task timestamps and reopen details:', mode);
      } finally { await context.close(); }
    }
    for (const view of ['dashboard', 'assignment']) {
      const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
      const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
      await page.goto(`${base}/?view=${view}`);
      const start = page.getByRole('button', { name: 'Start', exact: true });
      await start.waitFor(); await fail(page, 'http'); await start.click();
      await page.getByText('Synthetic save rejected', { exact: true }).first().waitFor();
      assert.equal((await snapshot(page)).status, 'pending');
      assert.equal((await page.evaluate(() => window.phaseOneTest.monitorEvents)).length, 0);
      await start.click(); await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
      assert((await snapshot(page)).runningStartedAt);
      const requestsBefore = await page.evaluate(() => window.phaseOneTest.requests.filter(r=>!r.url.includes('/task-timers?')).length);
      await page.getByRole('button', { name: 'Done', exact: true }).click();
      await page.getByRole('dialog', { name: 'Complete Task' }).waitFor();
      assert.equal(await page.evaluate(() => window.phaseOneTest.requests.filter(r=>!r.url.includes('/task-timers?')).length), requestsBefore);
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      assert((await snapshot(page)).runningStartedAt, 'Cancel must not pause');
      await fail(page, 'network'); await page.getByRole('button', { name: 'Pause', exact: true }).click();
      await page.getByText('Synthetic network failure', { exact: true }).first().waitFor();
      assert((await snapshot(page)).runningStartedAt, 'Failed pause must retain running state');
      await page.getByRole('button', { name: 'Pause', exact: true }).click();
      await page.getByRole('button', { name: 'Resume', exact: true }).waitFor();
      assert.equal((await snapshot(page)).runningStartedAt, null);
      await page.getByRole('button', { name: 'Resume', exact: true }).click();
      await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
      if (view === 'assignment') {
        await page.getByRole('button', { name: 'Save Work', exact: true }).click();
        await page.getByText('Work note saved. Timer state is unchanged.', { exact: true }).waitFor();
        assert((await snapshot(page)).runningStartedAt, 'Saving a note must not pause the timer');
      }
      await page.getByRole('button', { name: 'Done', exact: true }).click();
      await page.getByLabel('Completion note', { exact: true }).fill('Keep this completion note');
      await fail(page, 'html'); await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
      await page.getByText('The server returned an unexpected response. Refresh and try again.', { exact: true }).first().waitFor();
      assert.equal(await page.getByLabel('Completion note', { exact: true }).inputValue(), 'Keep this completion note');
      assert.equal((await snapshot(page)).status, 'in_progress');
      assert((await snapshot(page)).runningStartedAt);
      await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
      await page.getByRole('button', { name: 'Reopen', exact: true }).waitFor();
      assert.equal((await snapshot(page)).status, 'done');
      assert.equal((await snapshot(page)).runningStartedAt, null);
      if (view === 'assignment') {
        const count = await page.evaluate(() => window.phaseOneTest.requests.filter(r => r.url.endsWith('/report')).length);
        await page.getByRole('button', { name: 'Submit for Review' }).click();
        await page.waitForFunction(() => window.phaseOneTest.submitted);
        assert.equal(await page.evaluate(() => window.phaseOneTest.requests.filter(r => r.url.endsWith('/report')).length), count);
      }
      await page.getByRole('button', { name: 'Reopen', exact: true }).click();
      await page.getByLabel('Why are you reopening this task?').fill('Additional testing is required');
      await fail(page, 'http'); await page.getByRole('button', { name: 'Reopen Task', exact: true }).click();
      await page.getByRole('button', { name: 'Reopen Task', exact: true }).waitFor({ state: 'visible' });
      await page.waitForFunction(() => !document.querySelector('button:disabled')?.textContent?.includes('Reopening'));
      assert.equal((await snapshot(page)).status, 'done');
      await page.getByRole('button', { name: 'Reopen Task', exact: true }).click();
      await page.getByRole('button', { name: 'Resume', exact: true }).waitFor();
      assert.equal((await snapshot(page)).status, 'in_progress');
      assert.equal((await snapshot(page)).runningStartedAt, null);
      assert.equal(await page.getByLabel('Task start time', { exact: true }).count() ? await page.getByLabel('Task start time', { exact: true }).getAttribute('readonly') !== null : true, true);
      console.log('PASS', view, 'Start/Pause failures, resume, non-mutating Done cancel, failed-save note retention, completion and reopen');
      await context.close();
    }
    {
      const context=await browser.newContext({viewport:{width:1365,height:900}});
      const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
      await page.goto(base+'/?view=dashboard');
      await page.getByRole('button',{name:'Start',exact:true}).click();
      await page.getByRole('button',{name:'Pause',exact:true}).waitFor();
      const saved=await snapshot(page);
      await page.evaluate(()=>{localStorage.setItem('task-timer:'+window.phaseOneTest.timer.reportDate+':'+window.phaseOneTest.timer.taskId,JSON.stringify({status:'done',trackedMinutes:'99999',runningStartedAt:''}));});
      await page.reload();await page.getByRole('button',{name:'Pause',exact:true}).waitFor();
      assert.equal((await snapshot(page)).actualStart,saved.actualStart,'Refresh must recover server start, not local cache');
      const second=await context.newPage();second.on('pageerror',e=>errors.push(e.message));
      await second.goto(base+'/?view=dashboard');await second.getByRole('button',{name:'Pause',exact:true}).waitFor();
      await page.getByRole('button',{name:/^Active \(/}).click();
      await second.getByRole('button',{name:'Pause',exact:true}).click();
      await second.getByRole('button',{name:'Resume',exact:true}).waitFor();
      await page.getByRole('button',{name:'Active (0)',exact:true}).waitFor();
      await page.getByRole('button',{name:/^All \(/}).click();
      await page.getByRole('button',{name:'Resume',exact:true}).waitFor();
      const postCount=await page.evaluate(()=>window.phaseOneTest.requests.filter(r=>!r.url.includes('/task-timers?')).length);
      await page.evaluate(()=>window.dispatchEvent(new Event('beforeunload')));
      assert.equal(await page.evaluate(()=>window.phaseOneTest.requests.filter(r=>!r.url.includes('/task-timers?')).length),postCount,'Unload must not mutate timers');
      await page.evaluate(()=>{Date.now=()=>946684800000;});
      await page.getByRole('button',{name:'Resume',exact:true}).click();
      await page.getByRole('button',{name:'Pause',exact:true}).waitFor();
      assert.equal((await snapshot(page)).actualStart,saved.actualStart,'Browser clock changes cannot rewrite the original start');
      console.log('PASS refresh recovery, tampered local cache, cross-tab Active filter, non-mutating unload, browser-clock skew');
      await context.close();
    }
    const page = await browser.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/?view=modal`); await page.getByRole('button', { name: 'Add Task', exact: true }).click();
    await page.getByRole('dialog', { name: "Add Today's Task" }).waitFor();
    assert.equal(await page.getByText('Time Tracker', { exact: true }).count(), 0);
    assert.equal(await page.getByText('Completion %', { exact: true }).count(), 0);
    console.log('PASS Add Task contains no legacy tracker or manual completion controls');
    assert.deepEqual(errors, [], 'No browser runtime errors');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
