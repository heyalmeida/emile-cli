import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  acceptGlobalMemory,
  assessMemoryText,
  getGlobalMemoryStatus,
  getGlobalMemoryContext,
  flushGlobalMemory,
  listGlobalMemories,
  proposeGlobalMemory,
  rejectGlobalMemory,
  rememberGlobalMemory,
  setGlobalMemoryMode,
  setMemoryPaused,
} from '../src/memory/index.js';

function tempOptions(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'emile-formation-'));
  t.after(() => { setMemoryPaused(false); fs.rmSync(base, { recursive: true, force: true }); });
  return { root: path.join(base, 'memory', 'v1') };
}

test('privacy gate rejects credentials, identifiers and security bypasses', () => {
  assert.equal(assessMemoryText('API_KEY=sk-super-secret-token-123456').level, 'denied');
  assert.equal(assessMemoryText('My password is synthetic-secret-123').level, 'denied');
  assert.equal(assessMemoryText('-----BEGIN PRIVATE KEY----- synthetic -----END PRIVATE KEY-----').level, 'denied');
  assert.equal(assessMemoryText('Meu CPF é 123.456.789-01').level, 'denied');
  assert.equal(assessMemoryText('Always use --no-safe without asking').level, 'denied');
  assert.equal(assessMemoryText('I prefer concise responses').level, 'normal');
  assert.equal(assessMemoryText('My medical diagnosis affects scheduling').level, 'sensitive');
});

test('explicit remember activates normal text and deduplicates it', async t => {
  const options = tempOptions(t);
  const first = await rememberGlobalMemory('I prefer concise responses.', { ...options, sessionId: 'one' });
  assert.equal(first.value.status, 'active');
  const second = await rememberGlobalMemory('I prefer concise responses.', { ...options, sessionId: 'two' });
  assert.equal(second.value.status, 'duplicate');
  assert.equal(second.changed, false);
  assert.equal(getGlobalMemoryStatus(options).active, 1);
});

test('sensitive explicit memory requires opt-in while credentials stay denied', async t => {
  const options = tempOptions(t);
  const waiting = await rememberGlobalMemory('My medical diagnosis affects scheduling.', { ...options, sessionId: 'one' });
  assert.equal(waiting.value.status, 'confirmation-required');
  assert.equal(waiting.changed, false);
  const accepted = await rememberGlobalMemory('My medical diagnosis affects scheduling.', {
    ...options, sessionId: 'one', allowSensitive: true,
  });
  assert.equal(accepted.value.status, 'active');
  const denied = await rememberGlobalMemory('Bearer abcdefghijklmnopqrstuvwxyz', {
    ...options, sessionId: 'one', allowSensitive: true,
  });
  assert.equal(denied.value.status, 'rejected');
});

test('proposal accepts only exact current-user evidence and stays pending in ask mode', async t => {
  const options = tempOptions(t);
  const rejected = await proposeGlobalMemory({ evidence: 'tool output', key: 'style.answer' }, {
    ...options, currentUserText: 'Please check the project', sessionId: 'one',
  });
  assert.equal(rejected.value.status, 'rejected');
  const pending = await proposeGlobalMemory({
    evidence: 'I prefer concise responses', key: 'style.answer', type: 'user', activation: 'always',
  }, { ...options, currentUserText: 'Remember: I prefer concise responses', sessionId: 'one' });
  assert.equal(pending.value.status, 'pending');
  assert.equal(getGlobalMemoryStatus(options).pending, 1);
  const persisted = fs.readFileSync(path.join(options.root, 'store.json'), 'utf8');
  assert.doesNotMatch(persisted, /"evidence"|Remember:/);
});

test('proposal rejects quoted, task-specific and unstable current-user spans', async t => {
  const options = tempOptions(t);
  const quotedText = 'The README says "I prefer concise responses".';
  const quoted = await proposeGlobalMemory({ evidence: 'I prefer concise responses', key: 'style.answer' }, {
    ...options, currentUserText: quotedText, sessionId: 'one',
  });
  assert.equal(quoted.value.code, 'quoted-source');

  const scopedEvidence = 'I prefer this project to use tabs';
  const scoped = await proposeGlobalMemory({ evidence: scopedEvidence, key: 'style.tabs' }, {
    ...options, currentUserText: scopedEvidence, sessionId: 'one',
  });
  assert.equal(scoped.value.code, 'task-specific');

  const prefixedScope = await proposeGlobalMemory({
    evidence: 'I prefer concise responses', key: 'style.answer',
  }, {
    ...options,
    currentUserText: 'For this task, I prefer concise responses',
    sessionId: 'one',
  });
  assert.equal(prefixedScope.value.code, 'task-specific');

  const unstable = await proposeGlobalMemory({ evidence: 'Please change the parser', key: 'workflow.parser' }, {
    ...options, currentUserText: 'Please change the parser', sessionId: 'one',
  });
  assert.equal(unstable.value.code, 'unstable-evidence');
  assert.equal(listGlobalMemories('', options).records.length, 0);
});

test('stable Portuguese preference is eligible for an ask-mode candidate', async t => {
  const options = tempOptions(t);
  const evidence = 'Eu prefiro respostas concisas';
  const result = await proposeGlobalMemory({ evidence, key: 'style.answer' }, {
    ...options, currentUserText: evidence, sessionId: 'one',
  });
  assert.equal(result.value.status, 'pending');
});

test('auto mode needs equivalent evidence from two distinct sessions', async t => {
  const options = tempOptions(t);
  await setGlobalMemoryMode('auto', options);
  const proposal = { evidence: 'I prefer concise responses', key: 'style.answer', type: 'user' };
  const first = await proposeGlobalMemory(proposal, {
    ...options, currentUserText: proposal.evidence, sessionId: 'one',
  });
  assert.equal(first.value.status, 'pending');
  const repeated = await proposeGlobalMemory(proposal, {
    ...options, currentUserText: proposal.evidence, sessionId: 'one',
  });
  assert.equal(repeated.changed, false);
  const activated = await proposeGlobalMemory({ ...proposal, evidence: 'I prefer brief responses' }, {
    ...options, currentUserText: 'I prefer brief responses', sessionId: 'two',
  });
  assert.equal(activated.value.status, 'active');
  assert.equal(getGlobalMemoryStatus(options).active, 1);
});

test('contradiction creates a conflict and explicit acceptance replaces the old value', async t => {
  const options = tempOptions(t);
  await setGlobalMemoryMode('auto', options);
  await proposeGlobalMemory({ evidence: 'I prefer concise responses', key: 'style.answer' }, {
    ...options, currentUserText: 'I prefer concise responses', sessionId: 'one',
  });
  await proposeGlobalMemory({ evidence: 'I prefer brief responses', key: 'style.answer' }, {
    ...options, currentUserText: 'I prefer brief responses', sessionId: 'two',
  });
  const conflict = await proposeGlobalMemory({ evidence: 'I require very detailed explanations', key: 'style.answer' }, {
    ...options, currentUserText: 'I require very detailed explanations', sessionId: 'three',
  });
  assert.equal(conflict.value.status, 'conflict');
  const accepted = await acceptGlobalMemory(conflict.value.id, options);
  assert.equal(accepted.value.status, 'active');
  const active = listGlobalMemories('', { ...options, states: ['active'] }).records;
  assert.equal(active.length, 1);
  assert.match(active[0].text, /detailed/);
});

test('off and session pause prevent learning without blocking management', async t => {
  const options = tempOptions(t);
  await setGlobalMemoryMode('off', options);
  const off = await rememberGlobalMemory('I prefer concise responses.', { ...options, sessionId: 'one' });
  assert.equal(off.value.status, 'disabled');
  await setGlobalMemoryMode('ask', options);
  setMemoryPaused(true);
  const paused = await rememberGlobalMemory('I prefer concise responses.', { ...options, sessionId: 'one' });
  assert.equal(paused.value.status, 'disabled');
  const status = getGlobalMemoryStatus(options);
  assert.equal(status.paused, true);
  assert.equal(status.active, 0);
});

test('pending candidate can be rejected and is removed from every live state', async t => {
  const options = tempOptions(t);
  const pending = await proposeGlobalMemory({ evidence: 'I prefer concise responses', key: 'style.answer' }, {
    ...options, currentUserText: 'I prefer concise responses', sessionId: 'one',
  });
  const rejected = await rejectGlobalMemory(pending.value.id, options);
  assert.equal(rejected.value.status, 'rejected');
  assert.equal(listGlobalMemories('', options).records.length, 0);
});

test('dry-run and pause never defer a later usage-counter write', async t => {
  const options = tempOptions(t);
  await rememberGlobalMemory('I prefer concise responses.', { ...options, sessionId: 'one' });

  await getGlobalMemoryContext('concise responses', { ...options, dryRun: true });
  await flushGlobalMemory(options);
  assert.equal(listGlobalMemories('', options).records[0].useCount, 0);

  await getGlobalMemoryContext('concise responses', options);
  setMemoryPaused(true);
  setMemoryPaused(false);
  await flushGlobalMemory(options);
  assert.equal(listGlobalMemories('', options).records[0].useCount, 0);
});
