import test from 'node:test';
import assert from 'node:assert/strict';

import { runAgent } from '../src/agent/agent.js';

async function* responseStream(content) {
  yield { choices: [{ delta: { content } }] };
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

test('Plans rejection occurs before any model request', async () => {
  let apiCalls = 0;
  const messages = await withMutedStdout(() => runAgent({
    model: 'test/model',
    plansMode: true,
    skills: [],
    cache: false,
    effort: 'low',
    messages: [],
    initialPrompt: 'Change the API configuration',
    requestPlanApproval: async ({ preview }) => {
      assert.equal(preview, 'Change the API configuration');
      return false;
    },
    createCompletion: async () => {
      apiCalls++;
      return responseStream('must not be requested');
    },
  }));

  assert.equal(apiCalls, 0);
  assert.equal(messages.filter(message => message.role === 'assistant').length, 0);
});

test('Plans approval adds the existing instruction before normal streaming', async () => {
  let apiCalls = 0;
  const messages = await withMutedStdout(() => runAgent({
    model: 'test/model',
    plansMode: true,
    skills: [],
    cache: false,
    effort: 'low',
    messages: [],
    initialPrompt: 'Add input validation',
    requestPlanApproval: async () => true,
    createCompletion: async () => {
      apiCalls++;
      return responseStream('Plan ready.');
    },
  }));

  assert.equal(apiCalls, 1);
  assert.equal(messages.at(-1).content, 'Plan ready.');
  assert.match(messages.at(-2).content, /Plan approved/);
});
