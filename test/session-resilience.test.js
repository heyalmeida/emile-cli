import test from 'node:test';
import assert from 'node:assert/strict';

import { refreshSessionSummary, countCompletedTurns } from '../src/agent/session-summary.js';
import { resumePendingTools } from '../src/agent/agent.js';
import { deleteSession, getSessionRecord, saveSession } from '../src/history.js';

test('counts completed user turns without depending on assistant/tool shape', () => {
  assert.equal(countCompletedTurns([
    { role: 'system', content: 'system' },
    { role: 'user', content: 'one' },
    { role: 'assistant', content: 'answer' },
    { role: 'tool', content: 'result' },
    { role: 'user', content: 'two' },
  ]), 2);
});

test('refreshes session summary at turn two and every tenth turn', async () => {
  const calls = [];
  const createCompletion = async (params) => {
    calls.push(params);
    return { choices: [{ message: { content: '  Updated   session title  ' } }] };
  };
  const messages = [
    { role: 'user', content: 'Build the provider layer.' },
    { role: 'assistant', content: 'Done.' },
  ];

  assert.equal(await refreshSessionSummary({
    model: 'test/model', messages, currentSummary: 'Initial title', turnCount: 1, createCompletion,
  }), 'Initial title');
  assert.equal(await refreshSessionSummary({
    model: 'test/model', messages, currentSummary: 'Initial title', turnCount: 2, createCompletion,
  }), 'Updated session title');
  assert.equal(await refreshSessionSummary({
    model: 'test/model', messages, currentSummary: 'Updated session title', turnCount: 3, createCompletion,
  }), 'Updated session title');
  assert.equal(await refreshSessionSummary({
    model: 'test/model', messages, currentSummary: 'Updated session title', turnCount: 10, createCompletion,
  }), 'Updated session title');

  assert.equal(calls.length, 2);
  assert.equal(calls[0].effort, 'low');
  assert.equal(calls[0].useCache, false);
  assert.equal(calls[0].stream, false);
});

test('summary API failure keeps the existing title', async () => {
  const current = 'Keep this title';
  const result = await refreshSessionSummary({
    model: 'test/model',
    messages: [{ role: 'user', content: 'task' }],
    currentSummary: current,
    turnCount: 2,
    createCompletion: async () => { throw new Error('unavailable'); },
  });
  assert.equal(result, current);
});

test('session records persist and expose a tool-pending checkpoint', () => {
  const sessionId = `test_session_resilience_${Date.now()}`;
  const pendingToolCalls = [{
    id: 'call_1',
    type: 'function',
    function: { name: 'listDir', arguments: JSON.stringify({ path: '.' }) },
  }];
  try {
    saveSession(sessionId, 'checkpoint', [
      { role: 'assistant', content: null, tool_calls: pendingToolCalls },
    ], { status: 'tool_pending', pendingToolCalls });
    const record = getSessionRecord(sessionId);
    assert.equal(record.status, 'tool_pending');
    assert.equal(record.pendingToolCalls[0].id, 'call_1');
  } finally {
    deleteSession(sessionId);
  }
});

test('pending-tool recovery is idempotent and checkpoints each result', async () => {
  const messages = [{ role: 'assistant', content: null }];
  const pendingToolCalls = [{
    id: 'call_unknown',
    type: 'function',
    function: { name: 'unknownTool', arguments: '{}' },
  }];
  const checkpoints = [];
  const first = await resumePendingTools({
    messages,
    pendingToolCalls,
    checkpointSession: async (_messages, metadata) => checkpoints.push(metadata.status),
  });
  const second = await resumePendingTools({
    messages,
    pendingToolCalls,
    checkpointSession: async () => { throw new Error('must not be called'); },
  });

  assert.deepEqual(first, { resumed: true, invalid: false });
  assert.deepEqual(second, { resumed: false, invalid: false });
  assert.equal(messages.filter(message => message.role === 'tool').length, 1);
  assert.deepEqual(checkpoints, ['tool_pending']);
});

test('malformed pending checkpoints fail closed without executing tools', async () => {
  const messages = [];
  const result = await resumePendingTools({
    messages,
    pendingToolCalls: [{ id: 'bad', function: { name: 'listDir', arguments: 'not-json' } }],
  });
  assert.deepEqual(result, { resumed: false, invalid: true });
  assert.deepEqual(messages, []);
});
