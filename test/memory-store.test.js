import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { MEMORY_FILES } from '../src/memory/constants.js';
import { acquireMemoryLock, releaseMemoryLock } from '../src/memory/lock.js';
import { ensureMemoryRoot } from '../src/memory/path.js';
import { checksumWalPayload, recoverMemoryState } from '../src/memory/recovery.js';
import { initializeMemory, mutateMemoryState, readMemoryState } from '../src/memory/store.js';

function tempRoot(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'emile-memory-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  return path.join(base, 'state', 'v1');
}

function record(overrides = {}) {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: `mem_${crypto.randomBytes(8).toString('hex')}`,
    revision: 1,
    type: 'user',
    state: 'active',
    key: 'communication.concise',
    text: 'I prefer concise answers.',
    tags: ['communication'],
    activation: 'relevant',
    confidence: 1,
    sourceKind: 'explicit',
    sourceSessionRef: 'sess_1111111111111111',
    createdAt: now,
    updatedAt: now,
    lastUsedAt: null,
    useCount: 0,
    evidenceSessionRefs: ['sess_1111111111111111'],
    sensitivity: 'normal',
    ...overrides,
  };
}

test('initialization creates a bounded global store without workspace state', async t => {
  const root = tempRoot(t);
  const result = await initializeMemory({ root });
  assert.equal(result.state.mode, 'ask');
  assert.equal(result.state.revision, 0);
  for (const name of ['store', 'backup', 'wal', 'overview']) {
    assert.equal(fs.lstatSync(path.join(root, MEMORY_FILES[name])).isFile(), true);
  }
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(root).mode & 0o777, 0o700);
    assert.equal(fs.statSync(path.join(root, MEMORY_FILES.store)).mode & 0o777, 0o600);
  }
});

test('mutation checkpoints a valid revision and generated overview', async t => {
  const root = tempRoot(t);
  const result = await mutateMemoryState(draft => { draft.records.push(record()); }, { root });
  assert.equal(result.changed, true);
  assert.equal(result.state.revision, 1);
  assert.equal(readMemoryState({ root }).state.records.length, 1);
  assert.match(fs.readFileSync(path.join(root, MEMORY_FILES.overview), 'utf8'), /I prefer concise answers/);
  assert.equal(fs.readFileSync(path.join(root, MEMORY_FILES.wal), 'utf8'), '');
});

test('dry-run mutation creates no root or artifacts', async t => {
  const root = tempRoot(t);
  fs.rmSync(path.dirname(root), { recursive: true, force: true });
  const result = await mutateMemoryState(draft => { draft.mode = 'auto'; }, { root, dryRun: true });
  assert.equal(result.simulated, true);
  assert.equal(result.state.mode, 'auto');
  assert.equal(fs.existsSync(root), false);
});

test('complete WAL state replays while a torn tail is ignored', async t => {
  const root = tempRoot(t);
  await initializeMemory({ root });
  const state = { schemaVersion: 1, revision: 1, mode: 'ask', records: [record()] };
  const payload = { baseRevision: 0, revision: 1, state };
  const event = { ...payload, checksum: checksumWalPayload(payload) };
  fs.writeFileSync(path.join(root, MEMORY_FILES.wal), `${JSON.stringify(event)}\n{"partial"`, 'utf8');
  const recovered = recoverMemoryState(root);
  assert.equal(recovered.replayed, 1);
  assert.equal(recovered.state.records.length, 1);
});

test('corrupt snapshot falls back to backup and quarantines invalid data', async t => {
  const root = tempRoot(t);
  await initializeMemory({ root });
  fs.writeFileSync(path.join(root, MEMORY_FILES.store), '{bad json', 'utf8');
  const recovered = readMemoryState({ root });
  assert.equal(recovered.health, 'degraded');
  assert.equal(recovered.recoveredFrom, 'backup');
  assert.equal(recovered.readOnly, false);
  assert.ok(fs.readdirSync(path.join(root, MEMORY_FILES.quarantine)).some(name => name.startsWith('store.json.')));
});

test('symlinked artifact is never followed outside the memory root', async t => {
  const root = tempRoot(t);
  await initializeMemory({ root });
  const outside = path.join(path.dirname(root), 'outside.json');
  fs.writeFileSync(outside, '{"secret":"unchanged"}', 'utf8');
  fs.unlinkSync(path.join(root, MEMORY_FILES.store));
  fs.symlinkSync(outside, path.join(root, MEMORY_FILES.store));
  const recovered = readMemoryState({ root });
  assert.equal(recovered.recoveredFrom, 'backup');
  assert.equal(fs.readFileSync(outside, 'utf8'), '{"secret":"unchanged"}');
});

test('symlinked root component is rejected', t => {
  const base = tempRoot(t);
  const actual = path.join(path.dirname(path.dirname(base)), 'actual');
  fs.mkdirSync(actual);
  const link = path.join(path.dirname(path.dirname(base)), 'link');
  fs.symlinkSync(actual, link);
  assert.throws(() => ensureMemoryRoot(path.join(link, 'v1')), /unsafe directory/);
});

test('writer lock rejects contention and only its owner can release it', async t => {
  const root = tempRoot(t);
  ensureMemoryRoot(root);
  const owner = await acquireMemoryLock(root);
  await assert.rejects(acquireMemoryLock(root, { retries: 0 }), /busy/);
  releaseMemoryLock({ ...owner, token: 'not-the-owner' });
  assert.equal(fs.existsSync(owner.lockPath), true);
  releaseMemoryLock(owner);
  assert.equal(fs.existsSync(owner.lockPath), false);
});

test('stale dead-owner lock is reclaimed', async t => {
  const root = tempRoot(t);
  ensureMemoryRoot(root);
  const lockPath = path.join(root, MEMORY_FILES.lock);
  fs.writeFileSync(lockPath, JSON.stringify({ token: 'stale', pid: 99999999, createdAt: Date.now() - 30_000 }), 'utf8');
  const lock = await acquireMemoryLock(root, { retries: 0 });
  assert.notEqual(lock.token, 'stale');
  releaseMemoryLock(lock);
});

test('purge mutation removes backup content and every quarantine artifact', async t => {
  const root = tempRoot(t);
  await mutateMemoryState(draft => { draft.records.push(record()); }, { root });
  const quarantine = path.join(root, MEMORY_FILES.quarantine);
  fs.mkdirSync(path.join(quarantine, 'nested'), { recursive: true });
  fs.writeFileSync(path.join(quarantine, 'copy.txt'), 'I prefer concise answers.', 'utf8');
  fs.writeFileSync(path.join(quarantine, 'nested', 'copy.txt'), 'I prefer concise answers.', 'utf8');
  await mutateMemoryState(draft => { draft.records = []; }, { root, purgeCopies: true });
  const managed = [MEMORY_FILES.store, MEMORY_FILES.backup, MEMORY_FILES.wal, MEMORY_FILES.overview];
  for (const name of managed) assert.doesNotMatch(fs.readFileSync(path.join(root, name), 'utf8'), /concise answers/);
  assert.deepEqual(fs.readdirSync(quarantine), []);
});
