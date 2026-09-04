import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { MAX_ARTIFACT_BYTES, MEMORY_FILES } from './constants.js';
import { createEmptyMemoryState, validateMemoryState } from './schema.js';
import { ensureMemoryDirectory, readRegularMemoryFile, resolveMemoryPath } from './path.js';

export function checksumWalPayload(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function quarantine(root, filePath, reason, dryRun) {
  if (dryRun || !fs.existsSync(filePath)) return;
  ensureMemoryDirectory(root, MEMORY_FILES.quarantine);
  const name = `${path.basename(filePath)}.${Date.now()}.${reason}`.replace(/[^a-zA-Z0-9._-]/g, '_');
  try { fs.renameSync(filePath, resolveMemoryPath(root, MEMORY_FILES.quarantine, name)); }
  catch { /* degraded read-only result still protects startup */ }
}

function readState(root, name, dryRun, errors) {
  const filePath = resolveMemoryPath(root, name);
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(readRegularMemoryFile(filePath));
    return validateMemoryState(parsed);
  } catch {
    errors.push(`${name}:invalid`);
    quarantine(root, filePath, 'invalid', dryRun);
    return null;
  }
}

function replayWal(root, initialState, dryRun, errors) {
  const walPath = resolveMemoryPath(root, MEMORY_FILES.wal);
  if (!fs.existsSync(walPath)) return { state: initialState, replayed: 0 };
  try {
    const raw = readRegularMemoryFile(walPath, { maxBytes: MAX_ARTIFACT_BYTES });
    const complete = raw.endsWith('\n') ? raw : raw.slice(0, raw.lastIndexOf('\n') + 1);
    let state = initialState;
    let replayed = 0;
    for (const line of complete.split('\n').filter(Boolean)) {
      const event = JSON.parse(line);
      const payload = { baseRevision: event.baseRevision, revision: event.revision, state: event.state };
      if (event.checksum !== checksumWalPayload(payload)) throw new Error('checksum');
      validateMemoryState(event.state);
      if (event.state.revision !== event.revision || event.revision !== event.baseRevision + 1) throw new Error('revision');
      if (event.revision <= state.revision) continue;
      if (event.baseRevision !== state.revision) throw new Error('sequence');
      state = event.state;
      replayed += 1;
    }
    return { state, replayed };
  } catch {
    errors.push(`${MEMORY_FILES.wal}:invalid`);
    quarantine(root, walPath, 'invalid', dryRun);
    return { state: initialState, replayed: 0 };
  }
}

export function recoverMemoryState(root, { dryRun = false } = {}) {
  const errors = [];
  const main = readState(root, MEMORY_FILES.store, dryRun, errors);
  const backup = main ? null : readState(root, MEMORY_FILES.backup, dryRun, errors);
  const base = main || backup || createEmptyMemoryState();
  const replay = replayWal(root, base, dryRun, errors);
  const hadArtifacts = Boolean(main || backup || errors.length || fs.existsSync(resolveMemoryPath(root, MEMORY_FILES.wal)));
  return {
    state: replay.state,
    health: errors.length ? 'degraded' : 'healthy',
    errors,
    recoveredFrom: main ? 'store' : backup ? 'backup' : replay.replayed ? 'wal' : 'empty',
    replayed: replay.replayed,
    readOnly: errors.length > 0 && !main && !backup && replay.replayed === 0 && hadArtifacts,
  };
}
