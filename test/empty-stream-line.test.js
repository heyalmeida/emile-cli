// empty-stream-line.test.js — verify the agent surfaces a one-liner
// when the model returns an empty response (spec 2026-09-02-empty-stream-line).
import test from 'node:test';
import assert from 'node:assert/strict';

import { runAgent } from '../src/agent/agent.js';

async function* streamOf(...deltas) {
  for (const d of deltas) { yield { choices: [{ delta: d }] }; }
}

async function* emptyStream() {
  // Generator that ends without yielding any chunk.
  return;
}

function captureStdout() {
  const writes = [];
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => { writes.push(String(chunk)); return true; };
  return { writes, restore() { process.stdout.write = orig; }, text: () => writes.join('') };
}

async function runOnce(createCompletion) {
  const out = captureStdout();
  try {
    await runAgent({
      model: 'test/empty',
      plansMode: false,
      skills: [],
      cache: false,
      effort: 'low',
      messages: [],
      initialPrompt: 'Hi',
      createCompletion,
    });
  } finally {
    out.restore();
  }
  return out.text();
}

test('empty stream renders a one-liner instead of a blank line', async () => {
  const text = await runOnce(async () => emptyStream());
  assert.match(text, /empty response/, 'the empty response notice must be written');
});

test('content-only stream does NOT render the empty response notice', async () => {
  const text = await runOnce(async () => streamOf({ content: 'Hello, world.' }));
  assert.doesNotMatch(text, /empty response/, 'the notice must not appear when there is content');
  assert.match(text, /Hello, world/, 'the content must still render normally');
});

test('reasoning-only stream does NOT render the empty response notice', async () => {
  const text = await runOnce(async () => streamOf(
    { reasoning_details: [{ type: 'reasoning.text', id: 't1', text: 'Thinking…' }] },
  ));
  assert.doesNotMatch(text, /empty response/, 'the notice must not appear when there is reasoning');
});

test('cancelled turn does NOT render the empty response notice', async () => {
  // Use a control that cancels before the stream is consumed.
  const { createTurnControl } = await import('../src/agent/turn-control.js');
  const out = captureStdout();
  const control = createTurnControl();
  control.requestStop('test');
  try {
    await runAgent({
      model: 'test/cancel',
      plansMode: false,
      skills: [],
      cache: false,
      effort: 'low',
      messages: [],
      initialPrompt: 'Hi',
      control,
      createCompletion: async () => streamOf({ content: 'should not render' }),
    });
  } finally {
    out.restore();
  }
  assert.doesNotMatch(out.text(), /empty response/, 'the notice must not appear after a cancel');
});
