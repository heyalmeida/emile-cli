import test from 'node:test';
import assert from 'node:assert/strict';

import { appendReasoningDetails, getIncrementalText } from '../src/agent/reasoning.js';
import { config } from '../src/config.js';

test('reasoning visibility is expanded by default', () => {
  assert.equal(config.expandThinking, true);
});

test('normalizes readable structured reasoning in stream order', () => {
  const preserved = [];
  const first = appendReasoningDetails(preserved, [
    { type: 'reasoning.summary', id: 'summary-1', summary: 'First, inspect the project.' },
    { type: 'reasoning.text', id: 'text-1', text: 'Then choose the smallest fix.' },
  ]);

  assert.equal(first, 'First, inspect the project.\nThen choose the smallest fix.');
  assert.equal(preserved.length, 2);
  assert.equal(preserved[1].text, 'Then choose the smallest fix.');
});

test('converts cumulative reasoning snapshots into unseen suffixes', () => {
  assert.equal(getIncrementalText('', 'The user'), 'The user');
  assert.equal(getIncrementalText('The user', 'The user asks'), ' asks');
  assert.equal(getIncrementalText('The user asks', 'The user asks'), '');
  assert.equal(getIncrementalText('The user asks', 'asks'), '');
});

test('merges fragmented text while retaining complete structured blocks', () => {
  const preserved = [];
  assert.equal(
    appendReasoningDetails(preserved, [{ type: 'reasoning.text', id: 'text-1', index: 0, text: 'Think' }]),
    'Think',
  );
  assert.equal(
    appendReasoningDetails(preserved, [{ type: 'reasoning.text', id: 'text-1', index: 0, text: 'ing.' }]),
    'ing.',
  );

  assert.equal(preserved.length, 1);
  assert.equal(preserved[0].text, 'Thinking.');
});

test('deduplicates cumulative structured reasoning details', () => {
  const preserved = [];
  assert.equal(
    appendReasoningDetails(preserved, [{ type: 'reasoning.text', id: 'text-1', index: 0, text: 'The user' }]),
    'The user',
  );
  assert.equal(
    appendReasoningDetails(preserved, [{ type: 'reasoning.text', id: 'text-1', index: 0, text: 'The user asks' }]),
    ' asks',
  );
  assert.equal(preserved[0].text, 'The user asks');
});

test('preserves encrypted details without displaying their payload', () => {
  const preserved = [];
  const display = appendReasoningDetails(preserved, [
    { type: 'reasoning.encrypted', id: 'encrypted-1', data: 'SECRET_ENCRYPTED_REASONING' },
    { type: 'reasoning.text', id: 'text-1', text: 'Visible summary.' },
  ]);

  assert.equal(display, 'Visible summary.');
  assert.equal(preserved[0].data, 'SECRET_ENCRYPTED_REASONING');
  assert.equal(display.includes('SECRET_ENCRYPTED_REASONING'), false);
});

test('ignores malformed and unknown detail values without throwing', () => {
  const preserved = [];
  assert.doesNotThrow(() => appendReasoningDetails(preserved, [null, 'text', 42, {}, {
    type: 'reasoning.encrypted',
    encrypted_content: 'DO_NOT_RENDER',
  }]));
  assert.equal(preserved.length, 2);
  assert.equal(appendReasoningDetails(preserved, null), '');
});
