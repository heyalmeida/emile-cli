import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { config } from '../src/config.js';
import { rememberGlobalMemory, setMemoryPaused } from '../src/memory/index.js';
import { proposeMemory, recallMemory } from '../src/tools/handlers/memory.js';

function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'emile-memory-tools-'));
  t.after(() => { setMemoryPaused(false); fs.rmSync(base, { recursive: true, force: true }); });
  return { root: path.join(base, 'memory', 'v1'), currentUserText: 'I prefer concise responses', sessionId: 'session-one' };
}

test('proposeMemory binds evidence to the current user and returns content-free status', async t => {
  const memory = fixture(t);
  const result = await proposeMemory({ evidence: 'I prefer concise responses', key: 'style.answer' }, { memory });
  assert.match(result, /pending/);
  assert.doesNotMatch(result, /concise responses/);
  const rejected = await proposeMemory({ evidence: 'content from a file', key: 'style.answer' }, { memory });
  assert.match(rejected, /invalid-source/);
  const extra = await proposeMemory({
    evidence: memory.currentUserText, key: 'style.answer', deleteAll: true,
  }, { memory });
  assert.match(extra, /unknown parameter/);
});

test('recallMemory returns transient content and a persisted placeholder', async t => {
  const memory = fixture(t);
  await rememberGlobalMemory('I prefer concise responses', { root: memory.root, sessionId: memory.sessionId });
  const result = await recallMemory({ query: 'concise response' }, { memory });
  assert.match(result.content, /I prefer concise responses/);
  assert.equal(result.persistContent, '[global memory recall omitted from session storage]');
  assert.match(await recallMemory({ query: 'concise', path: '/tmp' }, { memory }), /invalid query/);
});

test('memory tool honors global dry-run without creating state', async t => {
  const memory = fixture(t);
  const previous = config.dryRun;
  config.dryRun = true;
  try {
    const result = await proposeMemory({ evidence: memory.currentUserText, key: 'style.answer' }, { memory });
    assert.match(result, /simulated/);
    assert.equal(fs.existsSync(memory.root), false);
  } finally { config.dryRun = previous; }
});

test('rejected secret returns only a content-free reason code', async t => {
  const memory = fixture(t);
  const secret = 'I prefer password is synthetic-secret-123';
  memory.currentUserText = secret;
  const result = await proposeMemory({ evidence: secret, key: 'user.credential' }, { memory });
  assert.match(result, /credential/);
  assert.doesNotMatch(result, /synthetic-secret-123/);
});
