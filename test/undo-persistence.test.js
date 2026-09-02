import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function withTmpDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `emile-undo-${Date.now()}-`));
  try { return fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// Use a dedicated test workspace for undo persistence tests.
// Patch config.workspaceDir before importing the modules.
const TEST_WS = fs.mkdtempSync(path.join(os.tmpdir(), `emile-undo-test-${Date.now()}-`));

const { config, configureSession, pushUndo, clear } = await import('../src/tools/file-state.js');
const origWorkspace = config.workspaceDir;
config.workspaceDir = TEST_WS;

test.afterAll(() => {
  config.workspaceDir = origWorkspace;
  try { fs.rmSync(TEST_WS, { recursive: true, force: true }); } catch { /* best-effort */ }
});

// ── undo-stack ─────────────────────────────────────────────────────────────

test('undo-stack: push/pop respects LIFO order', async () => {
  const { push, pop } = await import('../src/tools/file-state/undo-stack.js');
  clear();
  push({ path: '/a', content: 'a' });
  push({ path: '/b', content: 'b' });
  assert.equal(pop().path, '/b');
  assert.equal(pop().path, '/a');
  clear();
});

test('undo-stack: pop returns null when empty', async () => {
  const { pop } = await import('../src/tools/file-state/undo-stack.js');
  clear();
  assert.equal(pop(), null);
  clear();
});

test('undo-stack: cap is enforced at 3', async () => {
  const { push, pop, clear, setCap } = await import('../src/tools/file-state/undo-stack.js');
  clear();
  setCap(3);
  push({ path: '/1', content: '1' });
  push({ path: '/2', content: '2' });
  push({ path: '/3', content: '3' });
  push({ path: '/4', content: '4' }); // overflow
  assert.equal(pop().path, '/2'); // oldest (/1) was discarded
  clear();
  setCap(50);
});

test('undo-stack: clear empties the stack', async () => {
  const { push, pop, clear } = await import('../src/tools/file-state/undo-stack.js');
  clear();
  push({ path: '/x', content: 'x' });
  clear();
  assert.equal(pop(), null);
});

test('undo-stack: rehydrate replaces the stack', async () => {
  const { push, rehydrate, pop, clear } = await import('../src/tools/file-state/undo-stack.js');
  clear();
  push({ path: '/old', content: 'old' });
  rehydrate([
    { path: '/new1', content: 'n1', ts: Date.now() },
    { path: '/new2', content: 'n2', ts: Date.now() },
  ]);
  assert.equal(pop().path, '/new2');
  assert.equal(pop().path, '/new1');
  clear();
});

// ── path helpers ───────────────────────────────────────────────────────────

test('hashContent is deterministic and non-empty', async () => {
  const { hashContent } = await import('../src/tools/file-state/path.js');
  const h1 = hashContent('hello world');
  const h2 = hashContent('hello world');
  assert.equal(h1, h2);
  assert.ok(h1.length > 0);
  assert.notEqual(hashContent('different'), h1);
});

test('entryId generates unique IDs', async () => {
  const { entryId } = await import('../src/tools/file-state/path.js');
  const ids = new Set();
  for (let i = 0; i < 100; i++) ids.add(entryId());
  assert.equal(ids.size, 100);
});

// ── persistence ─────────────────────────────────────────────────────────────

test('persistence: append writes a JSON file', async () => {
  const sessionId = `s-append-${Date.now()}`;
  const undoDir = path.join(TEST_WS, '.emile', 'undo', sessionId);
  const { append } = await import('../src/tools/file-state/persistence.js');
  const ok = append(sessionId, { path: '/a', content: 'hello' }, 'entry-1');
  assert.equal(ok, true);
  const file = path.join(undoDir, 'entry-1.json');
  assert.equal(fs.existsSync(file), true);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(data.path, '/a');
  assert.equal(data.content, 'hello');
  assert.equal(data.hash, null); // null content → no hash
});

test('persistence: append computes hash for non-null content', async () => {
  const sessionId = `s-hash-${Date.now()}`;
  const undoDir = path.join(TEST_WS, '.emile', 'undo', sessionId);
  const { append } = await import('../src/tools/file-state/persistence.js');
  append(sessionId, { path: '/b', content: 'world' }, 'e2');
  const data = JSON.parse(fs.readFileSync(path.join(undoDir, 'e2.json'), 'utf8'));
  assert.ok(typeof data.hash === 'string' && data.hash.length > 0);
});

test('persistence: rehydrate loads entries newest-first', async () => {
  const sessionId = `s-reorder-${Date.now()}`;
  const undoDir = path.join(TEST_WS, '.emile', 'undo', sessionId);
  fs.mkdirSync(undoDir, { recursive: true });
  const now = Date.now();
  fs.writeFileSync(path.join(undoDir, 'e1.json'), JSON.stringify({ id: 'e1', path: '/old', content: 'o', ts: now - 2000 }));
  fs.writeFileSync(path.join(undoDir, 'e2.json'), JSON.stringify({ id: 'e2', path: '/mid', content: 'm', ts: now - 1000 }));
  fs.writeFileSync(path.join(undoDir, 'e3.json'), JSON.stringify({ id: 'e3', path: '/new', content: 'n', ts: now }));
  const { rehydrate } = await import('../src/tools/file-state/persistence.js');
  const entries = rehydrate(sessionId, 50);
  assert.equal(entries[0].path, '/new');
  assert.equal(entries[1].path, '/mid');
  assert.equal(entries[2].path, '/old');
});

test('persistence: rehydrate respects cap', async () => {
  const sessionId = `s-cap-${Date.now()}`;
  const undoDir = path.join(TEST_WS, '.emile', 'undo', sessionId);
  fs.mkdirSync(undoDir, { recursive: true });
  for (let i = 0; i < 10; i++) {
    fs.writeFileSync(path.join(undoDir, `e${i}.json`), JSON.stringify({ id: `e${i}`, path: `/p${i}`, content: `${i}`, ts: Date.now() + i }));
  }
  const { rehydrate } = await import('../src/tools/file-state/persistence.js');
  const entries = rehydrate(sessionId, 3);
  assert.equal(entries.length, 3);
});

test('persistence: rehydrate skips malformed files', async () => {
  const sessionId = `s-malform-${Date.now()}`;
  const undoDir = path.join(TEST_WS, '.emile', 'undo', sessionId);
  fs.mkdirSync(undoDir, { recursive: true });
  const { append, rehydrate } = await import('../src/tools/file-state/persistence.js');
  append(sessionId, { path: '/good', content: 'g' }, 'good');
  fs.writeFileSync(path.join(undoDir, 'bad.json'), 'not json {{{');
  append(sessionId, { path: '/also-good', content: 'h' }, 'also-good');
  const entries = rehydrate(sessionId, 50);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].path, '/also-good');
  assert.equal(entries[1].path, '/good');
});

test('persistence: clearSession removes the undo dir', async () => {
  const sessionId = `s-clear-${Date.now()}`;
  const undoDir = path.join(TEST_WS, '.emile', 'undo', sessionId);
  fs.mkdirSync(undoDir, { recursive: true });
  const { append, clearSession } = await import('../src/tools/file-state/persistence.js');
  append(sessionId, { path: '/a', content: 'a' }, 'e1');
  append(sessionId, { path: '/b', content: 'b' }, 'e2');
  clearSession(sessionId);
  assert.equal(fs.existsSync(undoDir), false);
});

test('persistence: clearSession is idempotent', async () => {
  const { clearSession } = await import('../src/tools/file-state/persistence.js');
  clearSession(`nonexistent-undo-${Date.now()}`);
  // Should not throw.
});

// ── barrel pushUndo ──────────────────────────────────────────────────────────

test('pushUndo mirrors to .emile/undo/', async () => {
  const sessionId = `s-barrel-${Date.now()}`;
  configureSession(sessionId);
  clear();
  pushUndo({ path: '/test.js', content: 'initial' });
  const undoDir = path.join(TEST_WS, '.emile', 'undo', sessionId);
  assert.ok(fs.existsSync(undoDir), `undo dir should exist at ${undoDir}`);
  const files = fs.readdirSync(undoDir);
  assert.ok(files.length > 0, 'at least one undo file should exist');
});
