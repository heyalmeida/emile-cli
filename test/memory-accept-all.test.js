import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  acceptAllGlobalMemories,
  acceptGlobalMemory,
  getGlobalMemoryStatus,
  isMemorySkipConfirm,
  listGlobalMemories,
  listPendingMemories,
  proposeGlobalMemory,
  rejectGlobalMemory,
  setMemorySkipConfirm,
} from '../src/memory/index.js';

function tempOptions(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'emile-accept-all-'));
  t.after(() => {
    setMemorySkipConfirm(false);
    fs.rmSync(base, { recursive: true, force: true });
  });
  return { root: path.join(base, 'memory', 'v1') };
}

async function seedPending(options, t, count = 3) {
  const sessionId = `seed-${Date.now()}`;
  for (let index = 0; index < count; index += 1) {
    const evidence = `I prefer concise responses ${index + 1}`;
    const result = await proposeGlobalMemory(
      { evidence, key: `style.answer-${index + 1}` },
      { ...options, currentUserText: evidence, sessionId },
    );
    assert.equal(result.value.status, 'pending');
  }
  const status = getGlobalMemoryStatus(options);
  assert.equal(status.pending, count);
  return { sessionId, count };
}

test('listPendingMemories returns only state=pending', async t => {
  const options = tempOptions(t);
  await seedPending(options, t, 3);
  const pending = listPendingMemories(options).records;
  assert.equal(pending.length, 3);
  for (const record of pending) assert.equal(record.state, 'pending');
});

test('acceptAllGlobalMemories flips every pending to active in one mutation', async t => {
  const options = tempOptions(t);
  await seedPending(options, t, 3);
  const before = getGlobalMemoryStatus(options);
  assert.equal(before.pending, 3);
  assert.equal(before.active, 0);

  const result = await acceptAllGlobalMemories(options);
  assert.equal(result.value.status, 'active');
  assert.equal(result.value.count, 3);
  assert.equal(result.value.ids.length, 3);

  const after = getGlobalMemoryStatus(options);
  assert.equal(after.active, 3);
  assert.equal(after.pending, 0);
  for (const id of result.value.ids) {
    const record = listGlobalMemories(id, options).records[0];
    assert.equal(record.state, 'active');
    assert.equal(record.confidence, 1);
  }
});

test('acceptAllGlobalMemories is a no-op when there are no pending records', async t => {
  const options = tempOptions(t);
  const result = await acceptAllGlobalMemories(options);
  assert.equal(result.value.status, 'none');
  assert.equal(result.value.count, 0);
});

test('acceptAllGlobalMemories preserves active records and ignores conflict records', async t => {
  const options = tempOptions(t);
  const sessionId = 'one';
  // First make one active explicitly
  const evidenceA = 'I prefer concise responses';
  await proposeGlobalMemory({ evidence: evidenceA, key: 'style.answer' }, {
    ...options, currentUserText: evidenceA, sessionId,
  });
  await acceptGlobalMemory(listPendingMemories(options).records[0].id, options);
  // Now seed 2 more pending
  await seedPending(options, t, 2);
  const all = listGlobalMemories('', options).records;
  assert.equal(all.length, 3);
  const beforeActive = all.filter(r => r.state === 'active').length;
  const beforePending = all.filter(r => r.state === 'pending').length;
  assert.equal(beforeActive, 1);
  assert.equal(beforePending, 2);

  const result = await acceptAllGlobalMemories(options);
  assert.equal(result.value.count, 2);
  const after = getGlobalMemories_status__(options);
  assert.equal(after.active, 3);
  assert.equal(after.pending, 0);
});

function getGlobalMemories_status__(options) {
  const status = getGlobalMemoryStatus(options);
  return { active: status.active, pending: status.pending };
}

test('setMemorySkipConfirm / isMemorySkipConfirm are per-process boolean flags', t => {
  setMemorySkipConfirm(false);
  assert.equal(isMemorySkipConfirm(), false);
  setMemorySkipConfirm(true);
  assert.equal(isMemorySkipConfirm(), true);
  setMemorySkipConfirm(false);
  assert.equal(isMemorySkipConfirm(), false);
});

test('acceptAllGlobalMemories is atomic: revision bumps by exactly 1 regardless of pending count', async t => {
  const options = tempOptions(t);
  await seedPending(options, t, 5);
  // Read the revision right before the single bulk mutation
  const before = JSON.parse(fs.readFileSync(path.join(options.root, 'store.json'), 'utf8'));
  const result = await acceptAllGlobalMemories(options);
  assert.equal(result.value.count, 5);
  const after = JSON.parse(fs.readFileSync(path.join(options.root, 'store.json'), 'utf8'));
  // Bump per mutation, not per record — acceptAll is one mutateMemoryState call.
  assert.equal(after.revision, before.revision + 1);
});

test('acceptAllGlobalMemories is durable: WAL is checkpointed after success', async t => {
  const options = tempOptions(t);
  await seedPending(options, t, 2);
  await acceptAllGlobalMemories(options);
  const walPath = path.join(options.root, 'wal.ndjson');
  const walContent = fs.readFileSync(walPath, 'utf8');
  // After a successful mutation, the WAL is truncated to '' by writeAtomicMemoryFile
  assert.equal(walContent, '');
});

test('reject + acceptAll is equivalent to manual accept of remaining', async t => {
  const options = tempOptions(t);
  await seedPending(options, t, 4);
  const all = listPendingMemories(options).records;
  // Reject the first one
  await rejectGlobalMemory(all[0].id, options);
  // Accept-all the rest
  const result = await acceptAllGlobalMemories(options);
  assert.equal(result.value.count, 3);
  const status = getGlobalMemoryStatus(options);
  assert.equal(status.active, 3);
  assert.equal(status.pending, 0);
  // The rejected one is gone
  const remaining = listGlobalMemories('', options).records;
  assert.equal(remaining.length, 3);
  assert.ok(!remaining.find(r => r.id === all[0].id));
});

import { acceptPendingGlobalMemories, rejectPendingGlobalMemories } from '../src/memory/index.js';

test('acceptPendingGlobalMemories accepts a specific list of pending ids in one mutation', async t => {
  const options = tempOptions(t);
  await seedPending(options, t, 4);
  const all = listPendingMemories(options).records;
  const target = [all[0].id, all[2].id];
  const result = await acceptPendingGlobalMemories(target, options);
  assert.equal(result.value.status, 'active');
  assert.equal(result.value.count, 2);
  const status = getGlobalMemoryStatus(options);
  assert.equal(status.active, 2);
  assert.equal(status.pending, 2);
});

test('acceptPendingGlobalMemories ignores already-active ids and returns not-found when none match', async t => {
  const options = tempOptions(t);
  await seedPending(options, t, 2);
  const all = listPendingMemories(options).records;
  // First accept all to flip to active
  await acceptAllGlobalMemories(options);
  // Now try to accept them again
  const result = await acceptPendingGlobalMemories([all[0].id, all[1].id], options);
  assert.equal(result.value.status, 'not-found');
  assert.equal(result.value.count, 0);
});

test('rejectPendingGlobalMemories rejects a specific list in one mutation', async t => {
  const options = tempOptions(t);
  await seedPending(options, t, 3);
  const all = listPendingMemories(options).records;
  const target = [all[0].id, all[1].id];
  const result = await rejectPendingGlobalMemories(target, options);
  assert.equal(result.value.status, 'rejected');
  assert.equal(result.value.count, 2);
  const status = getGlobalMemoryStatus(options);
  assert.equal(status.active, 0);
  assert.equal(status.pending, 1);
  // The one not in the reject list is still there
  const remaining = listGlobalMemories('', options).records;
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, all[2].id);
});

test('acceptPendingGlobalMemories is a no-op for empty id list', async t => {
  const options = tempOptions(t);
  const result = await acceptPendingGlobalMemories([], options);
  assert.equal(result.value.status, 'none');
  assert.equal(result.value.count, 0);
  assert.equal(result.changed, false);
});

test('acceptPendingGlobalMemories bumps revision by exactly 1 regardless of id count', async t => {
  const options = tempOptions(t);
  await seedPending(options, t, 5);
  const all = listPendingMemories(options).records;
  const before = JSON.parse(fs.readFileSync(path.join(options.root, 'store.json'), 'utf8'));
  const result = await acceptPendingGlobalMemories([all[0].id, all[1].id, all[2].id, all[3].id, all[4].id], options);
  assert.equal(result.value.count, 5);
  const after = JSON.parse(fs.readFileSync(path.join(options.root, 'store.json'), 'utf8'));
  assert.equal(after.revision, before.revision + 1);
});
