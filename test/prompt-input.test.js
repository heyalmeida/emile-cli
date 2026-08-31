import test from 'node:test';
import assert from 'node:assert/strict';

import { isShiftEnterKey } from '../src/ui/prompt-input.js';

test('recognizes readline Shift+Enter', () => {
  assert.equal(isShiftEnterKey({ name: 'return', shift: true }), true);
  assert.equal(isShiftEnterKey({ name: 'enter', shift: true }), true);
});

test('recognizes terminal-specific Shift+Enter sequences', () => {
  assert.equal(isShiftEnterKey({ sequence: '\x1B[13;2u' }), true);
  assert.equal(isShiftEnterKey({ sequence: '\x1B[27;2;13~' }), true);
  assert.equal(isShiftEnterKey({ name: 'return', shift: false }), false);
  assert.equal(isShiftEnterKey({ name: 'return' }), false);
});
