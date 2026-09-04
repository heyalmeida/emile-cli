import { MEMORY_CONTEXT_TOKENS } from './constants.js';
import { fitMemoryContext } from './context.js';
import {
  acceptMemory,
  clearMemories,
  forgetMemories,
  listMemory,
  memoryDoctor,
  proposeMemory,
  rejectMemory,
  rememberMemory,
  setMemoryMode,
} from './operations.js';
import { retrieveMemories } from './retrieval.js';
import { initializeMemory, mutateMemoryState, readMemoryState } from './store.js';

let paused = false;
const pendingTouches = new Map();

function touchKey(options) { return options.root || 'default'; }
function runtimeOptions(options = {}) { return { ...options, paused }; }

export function setMemoryPaused(value) {
  paused = value === true;
  return paused;
}

export function isMemoryPaused() { return paused; }

export async function initializeGlobalMemory(options = {}) {
  return initializeMemory(options);
}

export function getGlobalMemoryStatus(options = {}) {
  const snapshot = readMemoryState(options);
  const active = snapshot.state.records.filter(record => record.state === 'active').length;
  const pending = snapshot.state.records.length - active;
  return { ...snapshot, active, pending, paused };
}

export async function getGlobalMemoryContext(query, options = {}) {
  const snapshot = readMemoryState(options);
  if (paused || snapshot.state.mode === 'off' || !query) {
    return { ...snapshot, records: [], text: '', estimatedTokens: 0, paused };
  }
  const selected = retrieveMemories(snapshot.state, query);
  const fitted = fitMemoryContext(selected.records, MEMORY_CONTEXT_TOKENS);
  if (fitted.records.length > 0) {
    const key = touchKey(options);
    const ids = pendingTouches.get(key) || new Set();
    for (const record of fitted.records) ids.add(record.id);
    pendingTouches.set(key, ids);
  }
  return { ...snapshot, ...fitted, paused };
}

export function recallGlobalMemories(query, options = {}) {
  const snapshot = readMemoryState(options);
  if (paused || snapshot.state.mode === 'off') return { ...snapshot, records: [], estimatedTokens: 0, paused };
  return { ...snapshot, ...retrieveMemories(snapshot.state, query), paused };
}

export async function flushGlobalMemory(options = {}) {
  const key = touchKey(options);
  const ids = pendingTouches.get(key);
  if (!ids?.size || options.dryRun) return { changed: false };
  pendingTouches.delete(key);
  try {
    return await mutateMemoryState(draft => {
      const now = new Date().toISOString();
      for (const record of draft.records) {
        if (!ids.has(record.id) || record.state !== 'active') continue;
        record.useCount += 1;
        record.lastUsedAt = now;
        record.updatedAt = now;
        record.revision = draft.revision + 1;
      }
    }, options);
  } catch (error) {
    pendingTouches.set(key, ids);
    return { changed: false, error: error.message };
  }
}

export async function rememberGlobalMemory(text, options = {}) { return rememberMemory(text, runtimeOptions(options)); }
export async function proposeGlobalMemory(proposal, options = {}) { return proposeMemory(proposal, runtimeOptions(options)); }
export async function setGlobalMemoryMode(mode, options = {}) {
  const result = await setMemoryMode(mode, options);
  if (mode === 'off') pendingTouches.clear();
  return result;
}
export async function acceptGlobalMemory(id, options = {}) { return acceptMemory(id, options); }
export async function rejectGlobalMemory(id, options = {}) { return rejectMemory(id, options); }
export async function forgetGlobalMemories(ids, options = {}) { return forgetMemories(ids, options); }
export async function clearGlobalMemories(options = {}) { pendingTouches.clear(); return clearMemories(options); }
export function listGlobalMemories(query = '', options = {}) { return listMemory(query, options); }
export function diagnoseGlobalMemory(options = {}) { return memoryDoctor(options); }
export { assessMemoryText } from './privacy.js';
