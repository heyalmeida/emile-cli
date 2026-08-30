import test from 'node:test';
import assert from 'node:assert/strict';
import { compressContextIfNeeded } from '../src/agent/compression.js';
import { calculateContextUsage } from '../src/agent/session-stats.js';

function makeMessages({ count = 10, contentSize = 100 } = {}) {
  return [
    { role: 'system', content: 'system' },
    ...Array.from({ length: count }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `message-${index}-` + 'x'.repeat(contentSize),
    })),
  ];
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

test('does not compress a 50k-token payload in a 1M context window', async () => {
  const messages = makeMessages({ contentSize: 20_000 });
  let completionCalls = 0;

  const compressed = await withMutedStdout(() => compressContextIfNeeded({
    model: 'google/gemini-2.5-pro',
    messages,
    contextTokens: 50_000,
    contextLimit: 1_048_576,
    createCompletion: async () => {
      completionCalls++;
      return { choices: [{ message: { content: 'summary' } }] };
    },
  }));

  assert.equal(compressed, false);
  assert.equal(completionCalls, 0);
});

test('compresses exactly at 80% of the model context, not immediately below it', async () => {
  const contextLimit = 1_048_576;
  const threshold = Math.floor(contextLimit * 0.8);
  const createCompletion = async () => ({
    choices: [{ message: { content: 'summary' } }],
  });

  const below = await withMutedStdout(() => compressContextIfNeeded({
    model: 'google/gemini-2.5-pro',
    messages: makeMessages(),
    contextTokens: threshold - 1,
    contextLimit,
    createCompletion,
  }));
  const atBoundary = await withMutedStdout(() => compressContextIfNeeded({
    model: 'google/gemini-2.5-pro',
    messages: makeMessages(),
    contextTokens: threshold,
    contextLimit,
    createCompletion,
  }));

  assert.equal(below, false);
  assert.equal(atBoundary, true);
});

test('falls back to model metadata and a token estimate instead of raw paid/free limits', async () => {
  const messages = makeMessages({ contentSize: 20_000 });
  let completionCalls = 0;

  const compressed = await withMutedStdout(() => compressContextIfNeeded({
    model: 'google/gemini-2.5-pro',
    messages,
    createCompletion: async () => {
      completionCalls++;
      return { choices: [{ message: { content: 'summary' } }] };
    },
  }));

  assert.ok(JSON.stringify(messages).length > 120_000);
  assert.equal(compressed, false);
  assert.equal(completionCalls, 0);
});

test('full-payload estimates include compressed secondary system messages', () => {
  const compressedSummary = {
    role: 'system',
    content: 'compressed context'.repeat(20),
  };
  const usage = calculateContextUsage({
    systemPrompt: 'primary system prompt',
    tools: [],
    messages: [
      { role: 'system', content: 'primary system prompt' },
      compressedSummary,
    ],
  });

  assert.equal(usage.systemChars, 'primary system prompt'.length);
  assert.equal(usage.messageChars, JSON.stringify(compressedSummary).length);
});

test('keeps the minimum history guard at the token boundary', async () => {
  let completionCalls = 0;
  const compressed = await withMutedStdout(() => compressContextIfNeeded({
    model: 'test/model',
    messages: makeMessages({ count: 7 }),
    contextTokens: 128_000,
    contextLimit: 128_000,
    createCompletion: async () => {
      completionCalls++;
      return { choices: [{ message: { content: 'summary' } }] };
    },
  }));

  assert.equal(compressed, false);
  assert.equal(completionCalls, 0);
});

test('requires more than 40% post-compression history growth before recompressing', async () => {
  const messages = makeMessages({ count: 12, contentSize: 500 });
  let completionCalls = 0;
  const createCompletion = async () => {
    completionCalls++;
    return { choices: [{ message: { content: `summary-${completionCalls}` } }] };
  };
  const gate = () => withMutedStdout(() => compressContextIfNeeded({
    model: 'test/model',
    messages,
    contextTokens: 800,
    contextLimit: 1_000,
    createCompletion,
  }));

  assert.equal(await gate(), true);
  const compressedSize = JSON.stringify(messages).length;
  messages.push({ role: 'user', content: 'small growth' });
  messages.push({ role: 'assistant', content: 'still below the boundary' });
  assert.equal(await gate(), false);
  assert.equal(completionCalls, 1);

  messages.push({
    role: 'user',
    content: 'g'.repeat(Math.ceil(compressedSize * 0.41)),
  });
  assert.equal(await gate(), true);
  assert.equal(completionCalls, 2);
});

test('a failed summary falls back to truncation and arms hysteresis', async () => {
  const messages = makeMessages({ contentSize: 1_500 });
  const initialLength = messages.length;
  const failed = await withMutedStdout(() => compressContextIfNeeded({
    model: 'test/model',
    messages,
    contextTokens: 800,
    contextLimit: 1_000,
    createCompletion: async () => {
      throw new Error('summary unavailable');
    },
  }));
  const retried = await withMutedStdout(() => compressContextIfNeeded({
    model: 'test/model',
    messages,
    contextTokens: 800,
    contextLimit: 1_000,
    createCompletion: async () => ({
      choices: [{ message: { content: 'summary' } }],
    }),
  }));

  assert.equal(failed, true);
  assert.ok(messages.length < initialLength);
  assert.equal(retried, false);
});
