import fs from 'node:fs';
import path from 'node:path';
import { MEMORY_FILES, MEMORY_MODES } from './constants.js';
import { addExplicitMemory, proposeMemoryCandidate } from './formation.js';
import { readMemoryState, mutateMemoryState } from './store.js';
import { searchMemoryRecords } from './retrieval.js';

export async function rememberMemory(text, options = {}) {
  return mutateMemoryState(draft => {
    if (draft.mode === 'off' || options.paused) return { status: 'disabled' };
    return addExplicitMemory(draft, text, options);
  }, options);
}

export async function proposeMemory(proposal, options = {}) {
  return mutateMemoryState(draft => {
    if (draft.mode === 'off' || options.paused) return { status: 'disabled' };
    return proposeMemoryCandidate(draft, proposal, options);
  }, options);
}

export async function setMemoryMode(mode, options = {}) {
  if (!MEMORY_MODES.includes(mode)) throw new Error('Memory mode must be off, ask or auto.');
  return mutateMemoryState(draft => {
    draft.mode = mode;
    return { status: 'updated', mode };
  }, options);
}

export async function acceptMemory(id, options = {}) {
  return mutateMemoryState(draft => {
    const target = draft.records.find(record => record.id === id && record.state !== 'active');
    if (!target) return { status: 'not-found' };
    if (target.conflictWith) draft.records = draft.records.filter(record => record.id !== target.conflictWith);
    target.state = 'active';
    delete target.conflictWith;
    target.confidence = 1;
    target.updatedAt = new Date().toISOString();
    target.revision = draft.revision + 1;
    return { status: 'active', id: target.id };
  }, { ...options, purgeCopies: true });
}

export async function rejectMemory(id, options = {}) {
  return mutateMemoryState(draft => {
    const before = draft.records.length;
    draft.records = draft.records.filter(record => !(record.id === id && record.state !== 'active'));
    return { status: draft.records.length < before ? 'rejected' : 'not-found', id };
  }, { ...options, purgeCopies: true });
}

export function listMemory(query = '', options = {}) {
  const snapshot = readMemoryState(options);
  return { ...snapshot, records: searchMemoryRecords(snapshot.state, query, options) };
}

export async function forgetMemories(ids, options = {}) {
  const wanted = new Set(ids);
  return mutateMemoryState(draft => {
    const removed = draft.records.filter(record => wanted.has(record.id)).map(record => record.id);
    draft.records = draft.records.filter(record => !wanted.has(record.id));
    return { status: removed.length ? 'forgotten' : 'not-found', ids: removed };
  }, { ...options, purgeCopies: wanted.size > 0 });
}

export async function clearMemories(options = {}) {
  return mutateMemoryState(draft => {
    const count = draft.records.length;
    draft.records = [];
    return { status: 'cleared', count };
  }, { ...options, purgeCopies: true });
}

export function memoryDoctor(options = {}) {
  const snapshot = readMemoryState(options);
  const artifacts = {};
  for (const [key, name] of Object.entries(MEMORY_FILES)) {
    const target = path.join(snapshot.root, name);
    try {
      const stat = fs.lstatSync(target);
      artifacts[key] = { exists: true, regular: stat.isFile(), directory: stat.isDirectory(), symlink: stat.isSymbolicLink(), bytes: stat.size };
    } catch { artifacts[key] = { exists: false }; }
  }
  return { ...snapshot, artifacts };
}
