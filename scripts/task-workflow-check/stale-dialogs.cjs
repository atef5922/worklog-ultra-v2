const assert = require('node:assert/strict');

// Real components, shared synthetic server state; never authenticates or writes employee data.
module.exports = async function checkStaleDialogs({browser, base, errors}) {
  const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('synthetic-server-timer')));
  for (const view of ['assignment', 'dashboard']) for (const action of ['complete', 'reopen']) for (const delaySync of [false, true]) {
    const context = await browser.newContext({viewport: delaySync ? {width: 390, height: 640} : {width: 1365, height: 900}});
    try {
      const fresh = await context.newPage(), old = await context.newPage();
      for (const page of [fresh, old]) page.on('pageerror', e => errors.push(e.message));
      async function completeOnFresh(note) {
        await fresh.getByRole('button', {name: 'Done', exact: true}).click();
        await fresh.getByLabel('Completion note', {exact: true}).fill(note);
        await fresh.getByRole('dialog').getByRole('button', {name: 'Save', exact: true}).click();
        await fresh.getByRole('button', {name: 'Reopen', exact: true}).waitFor();
      }
      async function reopenOnFresh() {
        await fresh.getByRole('button', {name: 'Reopen', exact: true}).click();
        await fresh.getByLabel('Why are you reopening this task?').fill('A new work cycle needs additional testing');
        await fresh.getByRole('button', {name: 'Reopen Task', exact: true}).click();
        await fresh.getByRole('button', {name: 'Resume', exact: true}).waitFor();
      }
      await fresh.goto(base + '/?view=dashboard');
      await fresh.getByRole('button', {name: 'Start', exact: true}).click();
      await fresh.getByRole('button', {name: 'Pause', exact: true}).waitFor();
      if (action === 'reopen') await completeOnFresh('First-cycle completion evidence');
      await old.goto(base + '/?view=' + view);
      const openName = action === 'complete' ? 'Done' : 'Reopen';
      const saveName = action === 'complete' ? 'Save' : 'Reopen Task';
      const label = action === 'complete' ? 'Completion note' : 'Why are you reopening this task?';
      await old.getByRole('button', {name: openName, exact: true}).click();
      const opened = await saved(old), draft = 'Keep the original draft for the original work cycle';
      await old.getByLabel(label, {exact: true}).fill(draft);
      if (delaySync) await old.evaluate(() => {window.phaseOneTest.deferTimerReads = true;});
      if (action === 'complete') await completeOnFresh('Completion from the other tab');
      await reopenOnFresh();
      await fresh.getByRole('button', {name: 'Resume', exact: true}).click();
      await fresh.getByRole('button', {name: 'Pause', exact: true}).waitFor();
      if (action === 'reopen') await completeOnFresh('New-cycle completion evidence');
      const latest = await saved(fresh);
      assert.notEqual(latest.revision, opened.revision);
      await old.bringToFront();
      await old.evaluate(() => window.dispatchEvent(new Event('focus')));
      if (!delaySync) {
        await old.waitForFunction(expected => window.phaseOneTest.lastReadRevision === expected, latest.revision);
      }
      const commandAction = action === 'complete' ? 'complete_task' : 'reopen_task';
      const writes = await old.evaluate(action => window.phaseOneTest.requests.filter(r => r.body.action === action).length, commandAction);
      await old.getByRole('dialog').getByRole('button', {name: saveName, exact: true}).click();
      await old.waitForFunction(({action, count}) => window.phaseOneTest.requests.filter(r => r.body.action === action).length > count, {action: commandAction, count: writes});
      const request = await old.evaluate(action => window.phaseOneTest.requests.filter(r => r.body.action === action).at(-1).body, commandAction);
      assert.equal(request.expectedRevision, opened.revision, 'An old dialog must never adopt a newer revision');
      assert.equal(request.expectedUserId, opened.userId);
      assert.equal(request.reportDate, opened.reportDate);
      await old.evaluate(() => {window.phaseOneTest.deferTimerReads = false;});
      await old.getByRole('dialog').getByRole('alert').getByText('Synthetic stale revision', {exact: true}).waitFor();
      const bounds = await old.getByRole('dialog').boundingBox();
      const viewport = old.viewportSize();
      assert(bounds.y >= -1 && bounds.y + bounds.height <= viewport.height + 1, 'Error dialog must fit the viewport');
      assert.equal(await old.getByLabel(label, {exact: true}).inputValue(), draft);
      assert.deepEqual(await saved(old), latest, 'Rejected Save must not change the new work cycle');
      if (action === 'reopen') {
        assert.equal(await old.getByRole('dialog').getByText('First-cycle completion evidence', {exact: true}).count(), 1, 'Reopen evidence stays bound to the opened completion');
      }
      // Recovery reads and a repeated click must not silently rebase the old dialog.
      await old.getByRole('dialog').getByRole('button', {name: saveName, exact: true}).click();
      await old.waitForFunction(({action, count}) => window.phaseOneTest.requests.filter(r => r.body.action === action).length > count, {action: commandAction, count: writes + 1});
      await old.getByRole('dialog').getByRole('alert').waitFor();
      const retried = await old.evaluate(action => window.phaseOneTest.requests.filter(r => r.body.action === action).at(-1).body, commandAction);
      assert.equal(retried.expectedRevision, opened.revision);
      assert.deepEqual(await saved(old), latest);
      assert.equal(await old.getByLabel(label, {exact: true}).inputValue(), draft);

      // Explicitly close, review the updated row, and open a new dialog.
      await old.getByRole('dialog').getByRole('button', {name: 'Cancel', exact: true}).click();
      await old.getByRole('button', {name: openName, exact: true}).click();
      await old.getByLabel(label, {exact: true}).fill('Reviewed the latest cycle and confirmed this action');
      await old.getByRole('dialog').getByRole('button', {name: saveName, exact: true}).click();
      await old.getByRole('dialog').waitFor({state: 'hidden'});
      const final = await saved(old);
      assert.equal(final.status, action === 'complete' ? 'done' : 'in_progress');
      assert.notEqual(final.revision, latest.revision);
      console.log('PASS stale dialog bound to opening revision, draft retention, safe retry and explicit fresh action:', view, action, delaySync ? 'delayed sync' : 'live sync');
    } finally { await context.close(); }
  }
  // Live seconds and polling alone must not invalidate a correctly opened dialog.
  for (const view of ['assignment', 'dashboard']) {
    const context = await browser.newContext({viewport: {width: 1365, height: 900}});
    try {
      const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
      await page.goto(base + '/?view=' + view);
      await page.getByRole('button', {name: 'Start', exact: true}).click();
      await page.getByRole('button', {name: 'Pause', exact: true}).waitFor();
      await page.getByRole('button', {name: 'Done', exact: true}).click();
      const opening = await saved(page);
      await page.getByLabel('Completion note', {exact: true}).fill('Completed after live seconds and polling');
      const began = await page.evaluate(() => performance.now());
      await page.waitForFunction(start => performance.now() - start >= 1200, began);
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await page.getByRole('dialog').getByRole('button', {name: 'Save', exact: true}).click();
      await page.getByRole('dialog').waitFor({state: 'hidden'});
      const result = await saved(page);
      assert.equal(result.status, 'done');
      assert(result.trackedMilliseconds >= 1000, 'Server must bank the full running segment, not the captured display time');
      const request = await page.evaluate(() => window.phaseOneTest.requests.find(r => r.body.action === 'complete_task').body);
      assert.equal(request.expectedRevision, opening.revision);
      assert.equal('trackedMinutes' in request || 'trackedMilliseconds' in request || 'actualEnd' in request, false);
      console.log('PASS normal Done after live seconds/polling keeps opening revision and server elapsed time:', view);
    } finally { await context.close(); }
  }

};
