import fs from 'node:fs';
import { MAX_ARTIFACT_BYTES, MEMORY_FILES } from './constants.js';
import { appendMemoryWal, purgeMemoryQuarantine, writeAtomicMemoryFile } from './io.js';
import { withMemoryLock } from './lock.js';
import { buildMemoryOverview } from './overview.js';
import { ensureMemoryRoot, getMemoryRoot, resolveMemoryPath } from './path.js';
import { checksumWalPayload, recoverMemoryState } from './recovery.js';
import { cloneMemoryState, createEmptyMemoryState, validateMemoryState } from './schema.js';

function serializeState(state) {
  const serialized = `${JSON.stringify(state, null, 2)}\n`;
  if (Buffer.byteLength(serialized, 'utf8') > MAX_ARTIFACT_BYTES - 1024) {
    throw new Error('Memory store has reached its size cap.');
  }
  return serialized;
}

function commitState(root, current, next, { purgeCopies = false } = {}) {
  const payload = { baseRevision: current.revision, revision: next.revision, state: next };
  const event = { ...payload, checksum: checksumWalPayload(payload) };
  appendMemoryWal(root, `${JSON.stringify(event)}\n`);
  writeAtomicMemoryFile(root, MEMORY_FILES.backup, serializeState(purgeCopies ? next : current));
  writeAtomicMemoryFile(root, MEMORY_FILES.store, serializeState(next));
  writeAtomicMemoryFile(root, MEMORY_FILES.overview, buildMemoryOverview(next));
  writeAtomicMemoryFile(root, MEMORY_FILES.wal, '');
  if (purgeCopies) purgeMemoryQuarantine(root);
}

function readWithoutCreating(root, dryRun) {
  const resolved = getMemoryRoot(root);
  if (!fs.existsSync(resolved)) {
    return {
      root: resolved,
      state: createEmptyMemoryState(),
      health: 'healthy',
      errors: [],
      recoveredFrom: 'empty',
      replayed: 0,
      readOnly: false,
    };
  }
  const safeRoot = ensureMemoryRoot(root);
  return { root: safeRoot, ...recoverMemoryState(safeRoot, { dryRun }) };
}

export function readMemoryState({ root, dryRun = false } = {}) {
  return readWithoutCreating(root, dryRun);
}

export async function initializeMemory({ root, dryRun = false } = {}) {
  const initial = readWithoutCreating(root, dryRun);
  if (dryRun || initial.readOnly) return initial;
  const storePath = resolveMemoryPath(initial.root, MEMORY_FILES.store);
  if (fs.existsSync(storePath) && initial.replayed === 0) return initial;

  const safeRoot = ensureMemoryRoot(root);
  return withMemoryLock(safeRoot, async () => {
    const latest = recoverMemoryState(safeRoot);
    if (latest.readOnly) return { root: safeRoot, ...latest };
    writeAtomicMemoryFile(safeRoot, MEMORY_FILES.store, serializeState(latest.state));
    writeAtomicMemoryFile(safeRoot, MEMORY_FILES.backup, serializeState(latest.state));
    writeAtomicMemoryFile(safeRoot, MEMORY_FILES.overview, buildMemoryOverview(latest.state));
    writeAtomicMemoryFile(safeRoot, MEMORY_FILES.wal, '');
    return { root: safeRoot, ...latest };
  });
}

export async function mutateMemoryState(mutator, {
  root,
  dryRun = false,
  purgeCopies = false,
} = {}) {
  if (typeof mutator !== 'function') throw new TypeError('Memory mutator must be a function.');
  if (dryRun) {
    const current = readWithoutCreating(root, true);
    if (current.readOnly) throw new Error('Memory store is read-only after recovery failure.');
    const draft = cloneMemoryState(current.state);
    const value = await mutator(draft, current.state);
    validateMemoryState(draft);
    return { ...current, state: draft, value, changed: JSON.stringify(draft) !== JSON.stringify(current.state), simulated: true };
  }

  const safeRoot = ensureMemoryRoot(root);
  return withMemoryLock(safeRoot, async () => {
    const current = recoverMemoryState(safeRoot);
    if (current.readOnly) throw new Error('Memory store is read-only after recovery failure.');
    const draft = cloneMemoryState(current.state);
    const value = await mutator(draft, current.state);
    const changed = JSON.stringify(draft) !== JSON.stringify(current.state) || purgeCopies;
    if (!changed) return { root: safeRoot, ...current, value, changed: false, simulated: false };
    draft.revision = current.state.revision + 1;
    validateMemoryState(draft);
    serializeState(draft);
    commitState(safeRoot, current.state, draft, { purgeCopies });
    return { root: safeRoot, state: draft, health: current.health, errors: current.errors, value, changed: true, simulated: false };
  });
}
