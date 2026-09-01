import test from 'node:test';
import assert from 'node:assert/strict';

import { formatCatalogModelLabel } from '../src/commands.js';
import { parseProviderModelIds } from '../src/models.js';
import { fmtK } from '../src/ui/theme.js';

test('formats catalog model metadata without control characters', () => {
  const label = formatCatalogModelLabel('provider/model\nname', {
    context: 128000,
    inputPrice: 0,
    outputPrice: 2.5,
  });

  assert.equal(label, 'provider/model name  (128k ctx · $0.00/$2.50 per 1M)');
  assert.doesNotMatch(label, /[\r\n\t]/);
});

test('formats million-token context windows with an M suffix', () => {
  const label = formatCatalogModelLabel('provider/large-context', {
    context: 1_000_000,
    inputPrice: 1,
    outputPrice: 2,
  });

  assert.match(label, /1M ctx/);
  assert.doesNotMatch(label, /1000k ctx/);
});

test('formats large token counts in the input footer with compact M units', () => {
  assert.equal(fmtK(1_000_000), '1M');
  assert.equal(fmtK(1_048_576), '1M');
  assert.equal(fmtK(1_500_000), '1.5M');
  assert.equal(fmtK(128_000), '128k');
});

test('bounds malformed catalog ids and metadata to a safe label', () => {
  const label = formatCatalogModelLabel(`  ${'x'.repeat(200)}  `, {
    context: 'invalid',
    inputPrice: Number.NaN,
    outputPrice: undefined,
  });

  assert.ok(label.length < 140);
  assert.match(label, /context n\/a/);
  assert.match(label, /\$n\/a\/\$n\/a/);
});


test('parseProviderModelIds extracts and trims non-empty ids', () => {
  assert.deepEqual(
    parseProviderModelIds({ data: [
      { id: 'claude-sonnet-4-5' },
      { id: '  deepseek-v4-pro  ' },
      { id: '' },
      { id: 42 },
      null,
    ] }),
    ['claude-sonnet-4-5', 'deepseek-v4-pro'],
  );
});

test('parseProviderModelIds returns an empty list for malformed payloads', () => {
  assert.deepEqual(parseProviderModelIds(null), []);
  assert.deepEqual(parseProviderModelIds({ data: 'nope' }), []);
  assert.deepEqual(parseProviderModelIds({}), []);
});
