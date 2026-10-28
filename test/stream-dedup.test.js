// stream-dedup.test.js — protects history from replayed shorter snapshots.
import test from 'node:test';
import assert from 'node:assert/strict';

import { runAgent } from '../src/agent/agent.js';

async function* streamOf(...deltas) {
  for (const delta of deltas) {
    yield { choices: [{ delta }] };
  }
}

async function withMutedStdout(callback) {
  const original = process.stdout.write;
  process.stdout.write = () => true;
  try {
    return await callback();
  } finally {
    process.stdout.write = original;
  }
}

test('does not duplicate stale reasoning and content prefixes in agent history', async () => {
  const messages = await withMutedStdout(() => runAgent({
    model: 'test/stale-prefix',
    plansMode: false,
    skills: [],
    cache: false,
    effort: 'low',
    messages: [],
    initialPrompt: 'Explain the stream',
    createCompletion: async () => streamOf(
      { reasoning_content: 'The user' },
      { reasoning_content: 'The user asks' },
      { reasoning_content: 'The user' },
      { content: 'Hello' },
      { content: 'Hello world' },
      { content: 'Hello' },
    ),
  }));

  const assistant = messages.at(-1);
  assert.equal(assistant.reasoning_content, 'The user asks');
  assert.equal(assistant.content, 'Hello world');
  assert.equal(assistant.reasoning_content.includes('The user asksThe user'), false);
  assert.equal(assistant.content.includes('Hello worldHello'), false);
});
