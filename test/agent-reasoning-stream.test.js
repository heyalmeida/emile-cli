import test from 'node:test';
import assert from 'node:assert/strict';

import { runAgent } from '../src/agent/agent.js';

async function* streamOf(...deltas) {
  for (const delta of deltas) {
    yield { choices: [{ delta }] };
  }
}

async function withMutedStdout(callback) {
  const originalWrite = process.stdout.write;
  process.stdout.write = () => true;
  try {
    return await callback();
  } finally {
    process.stdout.write = originalWrite;
  }
}

test('renders cumulative legacy reasoning and content only once', async () => {
  const messages = await withMutedStdout(() => runAgent({
    model: 'test/model',
    plansMode: false,
    skills: [],
    cache: false,
    effort: 'low',
    messages: [],
    initialPrompt: 'Explain the project',
    createCompletion: async () => streamOf(
      { reasoning_content: 'The user' },
      { reasoning_content: 'The user asks' },
      { content: 'The answer' },
    ),
  }));

  const assistant = messages.at(-1);
  assert.equal(assistant.reasoning_content, 'The user asks');
  assert.equal(assistant.content, 'The answer');
});

test('does not render structured reasoning twice when legacy reasoning is also sent', async () => {
  const messages = await withMutedStdout(() => runAgent({
    model: 'test/model',
    plansMode: false,
    skills: [],
    cache: false,
    effort: 'low',
    messages: [],
    initialPrompt: 'Explain the project',
    createCompletion: async () => streamOf(
      {
        reasoning_content: 'The user',
        reasoning_details: [{ type: 'reasoning.text', id: 'text-1', text: 'The user' }],
      },
      {
        reasoning_content: 'The user asks',
        reasoning_details: [{ type: 'reasoning.text', id: 'text-1', text: 'The user asks' }],
      },
      { content: 'The answer' },
    ),
  }));

  const assistant = messages.at(-1);
  assert.equal(assistant.reasoning_content, 'The user asks');
  assert.equal(assistant.reasoning_details[0].text, 'The user asks');
});
