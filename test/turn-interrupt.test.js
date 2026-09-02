// turn-interrupt.test.js — cooperative cancel control for agent turns
// (spec 2026-09-01-turn-interrupt-queue).
import test from 'node:test';
import assert from 'node:assert/strict';

import { runAgent } from '../src/agent/agent.js';
import { createTurnControl } from '../src/agent/turn-control.js';
import { toolHandlers } from '../src/tools/index.js';

async function* streamOf(...deltas) {
  for (const delta of deltas) yield { choices: [{ delta }] };
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

test('createTurnControl starts active and records the stop reason', () => {
  const control = createTurnControl();
  assert.equal(control.shouldStop(), false);
  assert.equal(control.stopReason(), null);

  control.requestStop('interrupt');
  assert.equal(control.shouldStop(), true);
  assert.equal(control.stopReason(), 'interrupt');

  control.reset();
  assert.equal(control.shouldStop(), false);
});

test('a cancel request mid-stream keeps the partial text and stops consuming', async () => {
  const control = createTurnControl();

  async function* selfCancelingStream() {
    yield { choices: [{ delta: { content: 'partial ' } }] };
    control.requestStop('interrupt');
    yield { choices: [{ delta: { content: 'discarded' } }] };
  }

  const messages = await withMutedStdout(() => runAgent({
    model: 'test/model',
    plansMode: false,
    skills: [],
    cache: false,
    effort: 'low',
    messages: [],
    initialPrompt: 'write something',
    control,
    createCompletion: async () => selfCancelingStream(),
  }));

  const last = messages.at(-1);
  assert.equal(last.role, 'assistant');
  assert.equal(last.content, 'partial ');
  assert.equal(messages.some(m => String(m.content || '').includes('discarded')), false);
});

test('a cancel request mid-stream discards incomplete tool calls', async () => {
  const control = createTurnControl();

  async function* selfCancelingToolStream() {
    yield {
      choices: [{
        delta: {
          tool_calls: [{
            index: 0,
            id: 'call_1',
            function: { name: 'listDir', arguments: '{"path":"."}' },
          }],
        },
      }],
    };
    control.requestStop('interrupt');
    yield { choices: [{ delta: { content: 'more' } }] };
  }

  const messages = await withMutedStdout(() => runAgent({
    model: 'test/model',
    plansMode: false,
    skills: [],
    cache: false,
    effort: 'low',
    messages: [],
    initialPrompt: 'list files',
    control,
    createCompletion: async () => selfCancelingToolStream(),
  }));

  assert.equal(messages.some(m => Array.isArray(m.tool_calls) && m.tool_calls.length > 0), false);
  assert.equal(messages.some(m => m.role === 'tool'), false);
});

test('a cancel request mid-tool-batch fills remaining calls with placeholder results', async () => {
  const control = createTurnControl();
  const originalListDir = toolHandlers.listDir;
  let listDirCalls = 0;

  // The first tool execution requests the stop; the second must be skipped.
  toolHandlers.listDir = async () => {
    listDirCalls += 1;
    control.requestStop('interrupt');
    return { content: '[]', attachments: [] };
  };

  try {
    const messages = await withMutedStdout(() => runAgent({
      model: 'test/model',
      plansMode: false,
      skills: [],
      cache: false,
      effort: 'low',
      messages: [],
      initialPrompt: 'list twice',
      control,
      createCompletion: async () => streamOf({
        tool_calls: [
          { index: 0, id: 'call_a', function: { name: 'listDir', arguments: '{}' } },
          { index: 1, id: 'call_b', function: { name: 'listDir', arguments: '{}' } },
        ],
      }),
    }));

    assert.equal(listDirCalls, 1);
    const toolMessages = messages.filter(m => m.role === 'tool');
    assert.equal(toolMessages.length, 2);
    assert.equal(toolMessages[0].content, '[]');
    assert.equal(toolMessages[1].tool_call_id, 'call_b');
    assert.equal(toolMessages[1].content, '[canceled by user]');
  } finally {
    toolHandlers.listDir = originalListDir;
  }
});
