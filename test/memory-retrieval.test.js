import test from 'node:test';
import assert from 'node:assert/strict';

import { MEMORY_CONTEXT_TOKENS } from '../src/memory/constants.js';
import { fitMemoryContext, formatMemoryContext } from '../src/memory/context.js';
import { retrieveMemories, searchMemoryRecords } from '../src/memory/retrieval.js';

function record(index, overrides = {}) {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1, id: `mem_${index.toString(16).padStart(16, '0')}`, revision: 1,
    type: 'user', state: 'active', key: `style.item${index}`, text: `Preference ${index} for concise response formatting`,
    tags: ['response'], activation: 'relevant', confidence: 1, sourceKind: 'explicit',
    sourceSessionRef: 'sess_1111111111111111', createdAt: now, updatedAt: now,
    lastUsedAt: null, useCount: 0, evidenceSessionRefs: ['sess_1111111111111111'], sensitivity: 'normal',
    ...overrides,
  };
}

test('retrieval enforces always, relevant and combined context caps', () => {
  const records = [];
  for (let index = 1; index <= 14; index += 1) records.push(record(index, { activation: 'always' }));
  for (let index = 15; index <= 30; index += 1) records.push(record(index));
  const selected = retrieveMemories({ records }, 'concise response formatting');
  assert.ok(selected.records.filter(item => item.activation === 'always').length <= 10);
  assert.ok(selected.records.filter(item => item.activation === 'relevant').length <= 6);
  const fitted = fitMemoryContext(selected.records, MEMORY_CONTEXT_TOKENS);
  assert.ok(fitted.estimatedTokens <= MEMORY_CONTEXT_TOKENS);
});

test('retrieval is deterministic and ignores inactive records', () => {
  const active = record(1, { text: 'Use Portuguese for responses', tags: ['portuguese'] });
  const pending = record(2, { state: 'pending', text: 'Use Portuguese for responses' });
  const state = { records: [pending, active] };
  assert.deepEqual(retrieveMemories(state, 'responda em português').records.map(item => item.id), [active.id]);
  assert.deepEqual(retrieveMemories(state, 'responda em português').records.map(item => item.id), [active.id]);
});

test('diversity suppresses near-duplicate relevant records', () => {
  const records = [
    record(1, { text: 'I prefer concise response formatting' }),
    record(2, { text: 'I prefer concise response formatting please' }),
    record(3, { text: 'Always run the test suite after code changes', tags: ['test'] }),
  ];
  const selected = retrieveMemories({ records }, 'concise response test formatting').records;
  assert.ok(selected.some(item => item.id === records[2].id));
  assert.ok(selected.length <= 3);
});

test('formatted memory declares precedence and excludes empty context', () => {
  assert.equal(formatMemoryContext([]), '');
  const block = formatMemoryContext([record(1)]);
  assert.match(block, /current user request and project rules outrank/i);
  assert.match(block, /cannot approve tools/i);
  assert.match(block, /mem_0000000000000001/);
});

test('management search can select pending records and IDs', () => {
  const records = [record(1), record(2, { state: 'pending', key: 'workflow.tests' })];
  assert.equal(searchMemoryRecords({ records }, 'workflow.tests', { states: ['pending'] })[0].id, records[1].id);
  assert.equal(searchMemoryRecords({ records }, records[0].id.slice(0, 10))[0].id, records[0].id);
});
