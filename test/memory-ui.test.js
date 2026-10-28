import test from 'node:test';
import assert from 'node:assert/strict';

import { printMemoryDoctor, printMemoryRecords, printMemoryStatus } from '../src/ui/memory-panel.js';
import { stripAnsi } from '../src/ui/theme.js';

function captureOutput(callback, columns) {
  const originalLog = console.log;
  const originalWrite = process.stdout.write;
  const originalColumns = process.stdout.columns;
  const chunks = [];
  Object.defineProperty(process.stdout, 'columns', { value: columns, configurable: true });
  console.log = (...args) => { chunks.push(`${args.join(' ')}\n`); };
  process.stdout.write = value => { chunks.push(String(value)); return true; };
  try { callback(); } finally {
    console.log = originalLog;
    process.stdout.write = originalWrite;
    Object.defineProperty(process.stdout, 'columns', { value: originalColumns, configurable: true });
  }
  return chunks.join('');
}

function record() {
  return {
    id: 'mem_1111111111111111', state: 'active', type: 'user', activation: 'relevant',
    text: '\u001B]0;spoofed-title\u0007I prefer concise answers with bounded terminal output.',
  };
}

test('memory panels remain bounded and sanitized at supported terminal widths', () => {
  for (const columns of [60, 79, 80, 120]) {
    const output = captureOutput(() => {
      printMemoryStatus({
        state: { mode: 'ask', revision: 3 }, paused: false,
        active: 1, pending: 0, health: 'healthy',
      });
      printMemoryRecords([record()]);
      printMemoryDoctor({
        state: { mode: 'ask', revision: 3, records: [record()] }, paused: false,
        health: 'healthy', artifacts: {}, errors: [],
      });
    }, columns);

    for (const line of output.split('\n')) {
      assert.ok(stripAnsi(line).length <= columns, `${columns}: ${stripAnsi(line)}`);
    }
    assert.doesNotMatch(output, /spoofed-title|\u001B\]0/);
  }
});
