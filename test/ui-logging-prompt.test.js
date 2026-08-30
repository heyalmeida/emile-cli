import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const runtimeFiles = [
  'src/agent/agent.js',
  'src/agent/compression.js',
  'src/plans.js',
  'src/api/client.js',
];

test('runtime status modules use the canonical UI palette', () => {
  for (const file of runtimeFiles) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /import\s+pc\s+from\s+['"]picocolors['"]/,
      `${file} must not import picocolors for output`);
    assert.doesNotMatch(source, /const\s+(?:ESC|amber|muted|green|red)\s*=/,
      `${file} must not define a duplicate color helper`);
  }
});

test('base system prompt keeps coding policy in English', () => {
  const source = fs.readFileSync('src/prompt.js', 'utf8');
  assert.match(source, /Before creating or modifying any file/);
  assert.match(source, /No Assumptions: Never assume/);
  assert.doesNotMatch(source, /Antes de criar|Proibição de Presunção/);
  assert.match(source, /Malicious Code: Do not write/);
  assert.match(source, /Always run commands or compile tests/);
});
