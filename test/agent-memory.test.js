import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runAgent } from '../src/agent/agent.js';
import { listGlobalMemories, rememberGlobalMemory } from '../src/memory/index.js';

async function* streamOf(delta) { yield { choices: [{ delta }] }; }
async function muted(callback) {
  const write = process.stdout.write;
  process.stdout.write = () => true;
  try { return await callback(); } finally { process.stdout.write = write; }
}
function root(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'emile-agent-memory-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  return path.join(base, 'memory', 'v1');
}

test('memory context reaches the request but not persisted live history', async t => {
  const memoryRoot = root(t);
  const calls = [];
  const messages = await muted(() => runAgent({
    model: 'test/model', plansMode: false, skills: [], cache: false, effort: 'low',
    messages: [], initialPrompt: 'Help with this task', memorySessionId: 'session-one', memoryRoot,
    loadMemoryContext: async () => ({ text: '=== USER-GLOBAL MEMORY ===\n- Prefer concise responses.\n=== END ===' }),
    createCompletion: async params => { calls.push(params); return streamOf({ content: 'Done.' }); },
  }));
  const requestUser = calls[0].messages.find(message => message.role === 'user');
  const liveUser = messages.find(message => message.role === 'user');
  assert.match(requestUser.content, /Prefer concise responses/);
  assert.doesNotMatch(liveUser.content, /Prefer concise responses/);
  assert.match(calls[0].messages[0].content, /current user request, then project rules, then confirmed global memory/i);
});

test('agent stores only a sanitized proposal call in history', async t => {
  const memoryRoot = root(t);
  let call = 0;
  const messages = await muted(() => runAgent({
    model: 'test/model', plansMode: false, skills: [], cache: false, effort: 'low',
    messages: [], initialPrompt: 'I prefer concise responses', memorySessionId: 'session-one', memoryRoot,
    createCompletion: async () => {
      call += 1;
      if (call === 1) return streamOf({ tool_calls: [{ index: 0, id: 'mem_call', function: {
        name: 'proposeMemory', arguments: JSON.stringify({ evidence: 'I prefer concise responses', key: 'style.answer' }),
      } }] });
      return streamOf({ content: 'Noted.' });
    },
  }));
  const toolCall = messages.find(message => message.tool_calls)?.tool_calls[0];
  assert.equal(toolCall.function.arguments, '{"omitted":true}');
  assert.doesNotMatch(messages.find(message => message.role === 'tool').content, /concise/);
  assert.equal(listGlobalMemories('', { root: memoryRoot }).records[0].state, 'pending');
});

test('recall result is transient for the model and omitted from live session state', async t => {
  const memoryRoot = root(t);
  await rememberGlobalMemory('I prefer concise responses', { root: memoryRoot, sessionId: 'seed' });
  const calls = [];
  const messages = await muted(() => runAgent({
    model: 'test/model', plansMode: false, skills: [], cache: false, effort: 'low',
    messages: [], initialPrompt: 'How should you answer?', memorySessionId: 'session-two', memoryRoot,
    createCompletion: async params => {
      calls.push(params);
      if (calls.length === 1) return streamOf({ tool_calls: [{ index: 0, id: 'recall_call', function: {
        name: 'recallMemory', arguments: JSON.stringify({ query: 'concise response' }),
      } }] });
      return streamOf({ content: 'Concisely.' });
    },
  }));
  const transient = calls[1].messages.find(message => message.tool_call_id === 'recall_call');
  const stored = messages.find(message => message.tool_call_id === 'recall_call');
  assert.match(transient.content, /I prefer concise responses/);
  assert.equal(stored.content, '[global memory recall omitted from session storage]');
});

test('embedded agent calls without a memory session do not advertise memory tools', async () => {
  const calls = [];
  await muted(() => runAgent({
    model: 'test/model', plansMode: false, skills: [], cache: false, effort: 'low',
    messages: [], initialPrompt: 'Run without global state',
    createCompletion: async params => { calls.push(params); return streamOf({ content: 'Done.' }); },
  }));
  const names = calls[0].tools.map(tool => tool.function?.name).filter(Boolean);
  assert.equal(names.includes('proposeMemory'), false);
  assert.equal(names.includes('recallMemory'), false);
});
