import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const MAX_LOC = 150;

const ALL = [
  'src/lifecycle/index.js',
  'src/lifecycle/stop-input.js',
  'src/lifecycle/drain-tools.js',
  'src/lifecycle/flush-session.js',
  'src/lifecycle/flush-memory.js',
  'src/lifecycle/close-mcp.js',
  'src/lifecycle/restore-terminal.js',
  'src/tools/file-state.js',
  'src/tools/file-state/read-cache.js',
  'src/tools/file-state/undo-stack.js',
  'src/tools/file-state/persistence.js',
  'src/tools/file-state/path.js',
  'src/recovery.js',
  'src/memory/constants.js',
  'src/memory/context.js',
  'src/memory/formation.js',
  'src/memory/index.js',
  'src/memory/io.js',
  'src/memory/lock.js',
  'src/memory/operations.js',
  'src/memory/overview.js',
  'src/memory/path.js',
  'src/memory/privacy.js',
  'src/memory/recovery.js',
  'src/memory/retrieval.js',
  'src/memory/schema.js',
  'src/memory/store.js',
  'src/memory/tokens.js',
];

function wcLines(filePath) {
  return fs.readFileSync(filePath, 'utf8').split('\n').length;
}

for (const file of ALL) {
  const filePath = path.join(process.cwd(), file);
  if (!fs.existsSync(filePath)) continue;

  test(`${file}: lines ≤ ${MAX_LOC}`, () => {
    const lines = wcLines(filePath);
    assert.ok(
      lines <= MAX_LOC,
      `${file} has ${lines} lines (limit is ${MAX_LOC})`,
    );
  });
}
