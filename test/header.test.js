import test from 'node:test';
import assert from 'node:assert/strict';

import { stripAnsi } from '../src/ui/theme.js';
import { buildStartupScreenLines } from '../src/ui/header.js';

test('startup identity is compact and never depends on terminal-width filler', () => {
  const lines = buildStartupScreenLines('1.0.0').map(stripAnsi);
  assert.deepEqual(lines, ['  · emile v1.0.0', '  Developer coding agent']);
  assert.ok(lines.every(line => !/[╭╰─]/.test(line)));
});
