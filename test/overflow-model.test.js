// overflow-compression.test.js — forced compression on context overflow
// (IMPROVEMENTS.md §3.3) and model-catalog validation (§4.2).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { isKnownModel } from '../src/models.js';

describe('isKnownModel — provider-switch validation (§4.2)', () => {
  test('returns true when no catalog is active (cannot validate, so never blocks)', () => {
    assert.equal(isKnownModel('some/random-model'), true);
  });

  test('returns true for an empty/undefined model (no model to validate)', () => {
    assert.equal(isKnownModel(''), true);
    assert.equal(isKnownModel(undefined), true);
  });
});
