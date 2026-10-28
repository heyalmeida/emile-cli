// live-response-stream.test.js — verify response deltas are visible before
// the provider stream closes (spec 2026-09-03-live-response-streaming).
import test from 'node:test';
import assert from 'node:assert/strict';

import { runAgent } from '../src/agent/agent.js';

function captureStdout({ tty = false } = {}) {
  const writes = [];
  const original = process.stdout.write.bind(process.stdout);
  const originalIsTTY = process.stdout.isTTY;
  const originalRows = process.stdout.rows;
  process.stdout.write = (chunk) => {
    writes.push(String(chunk));
    return true;
  };
  if (tty) {
    // The in-place redraw path only runs on a TTY; tests that verify
    // progressive partial-line visibility fake one.
    process.stdout.isTTY = true;
    process.stdout.rows = 24;
  }
  return {
    writes,
    text: () => writes.join(''),
    restore() {
      process.stdout.write = original;
      if (tty) {
        if (originalIsTTY === undefined) delete process.stdout.isTTY;
        else process.stdout.isTTY = originalIsTTY;
        if (originalRows === undefined) delete process.stdout.rows;
        else process.stdout.rows = originalRows;
      }
    },
  };
}

async function* streamOf(...chunks) {
  for (const chunk of chunks) yield chunk;
}

async function waitFor(predicate, timeoutMs = 500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.fail('Timed out waiting for the expected streamed output');
}

async function runWithStream(createCompletion) {
  const output = captureStdout();
  try {
    const messages = await runAgent({
      model: 'test/live-stream',
      plansMode: false,
      skills: [],
      cache: false,
      effort: 'low',
      messages: [],
      initialPrompt: 'Say hello',
      createCompletion,
    });
    return { messages, text: output.text() };
  } finally {
    output.restore();
  }
}

test('renders a content delta before the stream releases', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  // Fake a TTY: the in-place redraw path is what makes a partial line visible
  // before its row is final (non-TTY/sealed output is line-buffered).
  const output = captureStdout({ tty: true });
  const run = runAgent({
    model: 'test/live-stream',
    plansMode: false,
    skills: [],
    cache: false,
    effort: 'low',
    messages: [],
    initialPrompt: 'Say hello',
    createCompletion: async () => (async function* () {
      yield { choices: [{ delta: { content: 'Par' } }] };
      await gate;
      yield { choices: [{ delta: { content: 'tial' } }] };
    })(),
  });

  try {
    await waitFor(() => output.text().includes('Par'));
    assert.doesNotMatch(output.text(), /tial/, 'the second delta is not released yet');
    release();
    const messages = await run;
    assert.equal(messages.at(-1).content, 'Partial');
    assert.equal((output.text().match(/╭─/g) || []).length, 1, 'the response box is opened once');
    assert.match(output.text(), /Partial/);
  } finally {
    release();
    await run.catch(() => {});
    output.restore();
  }
});

test('metadata-only streams finish with the existing empty-response notice', async () => {
  const { text } = await runWithStream(async () => streamOf(
    { usage: { prompt_tokens: 3, completion_tokens: 0 } },
    { choices: [] },
  ));
  assert.match(text, /empty response/);
  assert.doesNotMatch(text, /╭─/, 'an empty response must not open a response box');
});

test('reasoning-only streams do not open a response box', async () => {
  const { text } = await runWithStream(async () => streamOf({
    choices: [{ delta: { reasoning_content: 'Considering the request' } }],
  }));
  assert.match(text, /Considering the request/);
  assert.doesNotMatch(text, /╭─/);
  assert.doesNotMatch(text, /empty response/);
});

test('tool-only streams do not open a response box before the follow-up response', async () => {
  let call = 0;
  const { text } = await runWithStream(async () => {
    call += 1;
    if (call === 1) {
      return streamOf({
        choices: [{ delta: {
          tool_calls: [{
            index: 0,
            id: 'call_test',
            type: 'function',
            function: { name: 'notARealTool', arguments: '{}' },
          }],
        } }],
      });
    }
    return streamOf({ choices: [{ delta: { content: 'Follow-up complete.' } }] });
  });
  assert.equal((text.match(/╭─/g) || []).length, 1, 'only the follow-up response opens a box');
  assert.doesNotMatch(text, /empty response/);
  assert.match(text, /notAReal/);
  assert.match(text, /Follow-up complete/);
});
