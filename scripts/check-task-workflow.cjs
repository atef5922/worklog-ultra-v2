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
  const snapshot = page => page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => k.startsWith('task-timer:'));
    return key ? JSON.parse(localStorage.getItem(key)) : null;
  });
  try {
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
      const requestsBefore = await page.evaluate(() => window.phaseOneTest.requests.length);
      await page.getByRole('button', { name: 'Done', exact: true }).click();
      await page.getByRole('dialog', { name: 'Complete Task' }).waitFor();
      assert.equal(await page.evaluate(() => window.phaseOneTest.requests.length), requestsBefore);
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      assert((await snapshot(page)).runningStartedAt, 'Cancel must not pause');
      await fail(page, 'network'); await page.getByRole('button', { name: 'Pause', exact: true }).click();
      await page.getByText('Synthetic network failure', { exact: true }).first().waitFor();
      assert((await snapshot(page)).runningStartedAt, 'Failed pause must retain running state');
      await page.getByRole('button', { name: 'Pause', exact: true }).click();
      await page.getByRole('button', { name: 'Resume', exact: true }).waitFor();
      assert.equal((await snapshot(page)).runningStartedAt, '');
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
      assert.equal((await snapshot(page)).runningStartedAt, '');
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
      assert.equal((await snapshot(page)).runningStartedAt, '');
      assert.equal(await page.getByLabel('Task start time', { exact: true }).count() ? await page.getByLabel('Task start time', { exact: true }).getAttribute('readonly') !== null : true, true);
      console.log('PASS', view, 'Start/Pause failures, resume, non-mutating Done cancel, failed-save note retention, completion and reopen');
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
