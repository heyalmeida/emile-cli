import test from 'node:test';
import assert from 'node:assert/strict';

import { MAX_PENDING_RECORDS } from '../src/memory/constants.js';
import { normalizeMemoryKey } from '../src/memory/formation.js';
import { createEmptyMemoryState, validateMemoryState } from '../src/memory/schema.js';

function pending(index) {
  const now = new Date().toISOString();
  const suffix = index.toString(16).padStart(16, '0');
  return {
    schemaVersion: 1, id: `mem_${suffix}`, revision: 1, type: 'user', state: 'pending',
    key: `preference.item${index}`, text: `Preference ${index}`, tags: [], activation: 'relevant',
    confidence: 0.5, sourceKind: 'inferred', sourceSessionRef: 'sess_1111111111111111',
    createdAt: now, updatedAt: now, lastUsedAt: null, useCount: 0,
    evidenceSessionRefs: ['sess_1111111111111111'], sensitivity: 'normal',
  };
}

test('state schema enforces candidate cap and rejects unknown raw-evidence fields', () => {
  const state = createEmptyMemoryState();
  state.records = Array.from({ length: MAX_PENDING_RECORDS + 1 }, (_, index) => pending(index + 1));
  assert.throws(() => validateMemoryState(state), /record-cap/);

  state.records = [pending(1)];
  state.records[0].rawEvidence = 'must never persist';
  assert.throws(() => validateMemoryState(state), /record-field/);
});

test('memory keys normalize Unicode input without allowing path syntax', () => {
  const key = normalizeMemoryKey('Preferência / Respostas Curtas', 'fallback');
  assert.equal(key, 'preferencia.respostas.curtas');
  assert.doesNotMatch(key, /[/\\]/);
});
