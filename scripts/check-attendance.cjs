const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const esbuild = require('esbuild');
const { chromium } = require('playwright-core');

async function main() {
  const bundle = await esbuild.build({ entryPoints: [path.join(__dirname, 'attendance-check/entry.tsx')], bundle: true, write: false,
    platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' },
    alias: { 'next/navigation': path.join(__dirname, 'attendance-check/navigation.ts') } });
  const login = await (await fetch('http://localhost:3000/auth/login')).text();
  const css = [...login.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)].map(m => /href="([^"]+)"/.exec(m[0])?.[1]).filter(Boolean);
  const server = http.createServer((req, res) => {
    if (req.url === '/fixture.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(bundle.outputFiles[0].text); }
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!doctype html><html><head>${css.map(h => `<link rel="stylesheet" href="http://localhost:3000${h}">`).join('')}<style>body{padding:24px;background:#f1f5fb}button{cursor:pointer}</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const base = `http://127.0.0.1:${server.address().port}`, errors = [];
  const watch = page => page.on('pageerror', e => errors.push(e.message));
  const button = (page, name) => page.getByRole('button', { name, exact: true });
  const time = (page, value) => page.evaluate(value => window.attendanceTest.setNow(value), value);
  const fail = (page, value) => page.evaluate(value => { window.attendanceTest.failNext = value; }, value);
  const record = page => page.evaluate(() => window.attendanceTest.read().rows[0]);
  const metric = (page, label) => page.getByText(label, { exact: true }).locator('..').locator('p').last().innerText();
  try {
    const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
    const page = await context.newPage(); watch(page); await page.goto(base); await button(page, 'In').waitFor();
    await fail(page, 'http'); await button(page, 'In').click();
    await page.getByText('Synthetic attendance conflict', { exact: true }).first().waitFor();
    await button(page, 'In').waitFor(); assert.equal(await record(page), undefined);
    assert.deepEqual(await page.evaluate(() => window.attendanceTest.events), []);
    await button(page, 'In').click(); await button(page, 'Out').waitFor();
    const tab = await context.newPage(); watch(tab); await tab.goto(base); await button(tab, 'Out').waitFor();
    await time(page, '2026-09-14T14:00:00+06:00'); await fail(page, 'html'); await button(page, 'Take Break').click();
    await page.getByText('Attendance could not be confirmed. Refresh and try again.', { exact: true }).first().waitFor();
    assert.equal((await record(page)).breakSessions.length, 0);
    await button(page, 'Take Break').click(); await button(page, 'End Break').waitFor(); await button(tab, 'End Break').waitFor();
    await time(page, '2026-09-14T14:45:00+06:00'); await button(page, 'End Break').click(); await button(page, 'Take Break').waitFor();
    await time(page, '2026-09-14T16:00:00+06:00'); await fail(page, 'network'); await button(page, 'Out').click();
    await page.getByText('Synthetic network failure', { exact: true }).first().waitFor();
    assert.equal((await record(page)).workSessions[0].endedAt, null);
    await button(page, 'Out').click(); await button(page, 'In Again').waitFor(); await button(tab, 'In Again').waitFor();
    await time(page, '2026-09-14T17:00:00+06:00'); await button(page, 'In Again').click(); await button(page, 'Out').waitFor();
    await time(page, '2026-09-14T19:00:00+06:00'); await button(page, 'Out').click(); await button(page, 'In Again').waitFor();
    assert.equal(await metric(page, 'Counted Work'), '8h 00m'); assert.equal(await metric(page, 'Active Work'), '7h 15m');
    assert.equal(await metric(page, 'Included Break'), '0h 45m'); assert.equal(await metric(page, 'Outside Gap'), '1h 00m');
    await button(page, 'In Again').click(); await button(page, 'Out').waitFor();
    await time(page, '2026-09-14T20:00:00+06:00'); await fail(page, 'lost'); await button(page, 'Out').click();
    await button(page, 'In Again').waitFor(); assert.equal(await metric(page, 'Counted Work'), '9h 00m');
    assert.equal(await metric(page, 'Overtime'), '1h 00m');
    assert.equal((await record(page)).workSessions.length, 3);
    console.log('PASS attendance In/Out/Break, 45-minute credit, outside gap, overtime, failed saves, lost-response recovery and cross-tab synchronization');
    await context.close();

    const nightContext = await browser.newContext({ viewport: { width: 1365, height: 900 } });
    const night = await nightContext.newPage(); watch(night); await night.goto(base); await button(night, 'In').waitFor();
    await button(night, 'In').click(); await button(night, 'Out').waitFor();
    await time(night, '2026-09-15T00:10:00+06:00'); await night.reload(); await button(night, 'Out').waitFor();
    assert.equal((await record(night)).workSessions[0].endedAt, null);
    await button(night, 'Take Break').click(); await button(night, 'End Break').waitFor();
    await time(night, '2026-09-15T00:20:00+06:00'); await button(night, 'Out').click(); await button(night, 'In').waitFor();
    const closed = await record(night); assert.equal(closed.workSessions[0].endedAt, closed.breakSessions[0].endedAt);
    const outRequest = await night.evaluate(() => window.attendanceTest.requests.filter(r => r.body?.action === 'check_out').at(-1));
    assert.equal(outRequest.body.attendanceDate, '2026-09-14');
    await button(night, 'In').click(); await button(night, 'Out').waitFor();
    assert.equal(await night.evaluate(() => window.attendanceTest.read().rows.at(-1).attendanceDate), '2026-09-15');
    console.log('PASS overnight attendance, break closure on Out, and new-day In without a stale date/revision');
    await nightContext.close();
    const switchContext = await browser.newContext();
    const switched = await switchContext.newPage(); watch(switched); await switched.goto(base); await button(switched, 'In').waitFor();
    await switched.evaluate(() => window.attendanceTest.setAccount('another-employee'));
    await button(switched, 'In').click();
    await switched.getByText('Your session changed. Please sign in again.', {exact:true}).first().waitFor();
    assert.equal(await record(switched), undefined);
    assert.deepEqual(await switched.evaluate(() => window.attendanceTest.events), []);
    await switchContext.close();
    console.log('PASS stale-account first In blocked without fabricating attendance or start events');

    const correctionContext = await browser.newContext({viewport:{width:1365,height:900}});
    const editor = await correctionContext.newPage(); watch(editor); await editor.goto(base + '/correction');
    await button(editor, 'Correct / close sessions').click();
    const save = button(editor, 'Save correction');
    assert.equal(await save.isDisabled(), true);
    assert.equal(await editor.getByLabel('work start 1',{exact:true}).inputValue(), '14/09/2026 10:00:43.127');
    await editor.getByLabel('work end 1',{exact:true}).fill('14/09/2026 11:00');
    await editor.getByLabel('work end 2',{exact:true}).fill('14/09/2026 12:00');
    await editor.getByLabel('Correction reason',{exact:true}).fill('Verified both office sessions with the employee.');
    await editor.getByRole('checkbox').check();
    await fail(editor, 'http'); await save.click();
    await editor.getByText('Synthetic attendance conflict',{exact:true}).first().waitFor();
    assert.equal(await editor.getByLabel('Correction reason',{exact:true}).inputValue(), 'Verified both office sessions with the employee.');
    await save.click(); await editor.getByText('Attendance corrected.',{exact:true}).first().waitFor();
    const body = await editor.evaluate(() => window.attendanceTest.requests.filter(r=>r.method==='PUT').at(-1).body);
    assert.equal(body.closeOpenSessions, true); assert.equal(body.expectedRevision, 'a'.repeat(64));
    assert.equal(body.workSessions[0].startedAt, '2026-09-14T04:00:43.127Z');
    assert.equal(body.workSessions[0].endedAt, '2026-09-14T05:00:00.000Z');
    await correctionContext.close();
    console.log('PASS explicit recovery confirmation, revision-bound correction, failed-save draft retention and timestamp precision');
    assert.deepEqual(errors, [], 'No browser runtime errors');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
