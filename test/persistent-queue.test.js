// persistent-queue.test.js — the REPL dispatcher queues submissions while
// the agent is busy and drains them after the turn ends.
import test from 'node:test';
import assert from 'node:assert/strict';

test('submissions received while the agent is busy land in the queue', async () => {
  const pendingQueue = [];
  let isAgentBusy = false;
  const dispatchOrder = [];

  async function runAgentTurn(prompt) {
    isAgentBusy = true;
    dispatchOrder.push(`start:${prompt}`);
    // Simulate long work
    await new Promise(r => setTimeout(r, 30));
    isAgentBusy = false;
    dispatchOrder.push(`end:${prompt}`);
  }

  // Simulate three rapid submissions.
  async function onSubmit(text) {
    if (isAgentBusy) {
      pendingQueue.push(text);
      return 'queued';
    }
    runAgentTurn(text).then(drainQueue);
    return 'started';
  }

  async function drainQueue() {
    while (pendingQueue.length > 0) {
      const next = pendingQueue.shift();
      await runAgentTurn(next);
    }
  }

  // First submission starts immediately.
  await onSubmit('first');
  // While the first is in flight (wait a bit then push), two more arrive.
  await new Promise(r => setTimeout(r, 5));
  await onSubmit('second');
  await onSubmit('third');
  // Wait long enough for everything to drain.
  await new Promise(r => setTimeout(r, 200));

  assert.deepEqual(dispatchOrder, [
    'start:first',
    'end:first',
    'start:second',
    'end:second',
    'start:third',
    'end:third',
  ]);
});

test('slash commands bypass the queue and run immediately', async () => {
  const pendingQueue = [];
  let isAgentBusy = false;
  const calls = [];

  async function dispatchCommand(text) {
    if (text.startsWith('/')) {
      calls.push(`cmd:${text}`);
      return true;
    }
    return false;
  }

  async function onSubmit(text) {
    if (await dispatchCommand(text)) return 'command';
    if (isAgentBusy) { pendingQueue.push(text); return 'queued'; }
    return 'agent';
  }

  await onSubmit('/maxloop 99');
  await onSubmit('/help');
  assert.deepEqual(calls, ['cmd:/maxloop 99', 'cmd:/help']);
  assert.equal(pendingQueue.length, 0);
});
