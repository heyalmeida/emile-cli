import { mutateMemoryState } from './store.js';

export async function acceptAllPending(options = {}) {
  return mutateMemoryState(draft => {
    const now = new Date().toISOString();
    const targets = draft.records.filter(record => record.state === 'pending');
    if (targets.length === 0) return { status: 'none', count: 0, ids: [] };
    const ids = [];
    for (const target of targets) {
      if (target.conflictWith) {
        draft.records = draft.records.filter(record => record.id !== target.conflictWith);
      }
      target.state = 'active';
      delete target.conflictWith;
      target.confidence = 1;
      target.updatedAt = now;
      target.revision = draft.revision + 1;
      ids.push(target.id);
    }
    return { status: 'active', count: ids.length, ids };
  }, { ...options, purgeCopies: true });
}

export async function acceptPendingByIds(ids, options = {}) {
  const wanted = new Set(Array.isArray(ids) ? ids : []);
  if (wanted.size === 0) {
    return { value: { status: 'none', count: 0, ids: [] }, changed: false };
  }
  return mutateMemoryState(draft => {
    const now = new Date().toISOString();
    const accepted = [];
    for (const target of draft.records) {
      if (!wanted.has(target.id) || target.state !== 'pending') continue;
      if (target.conflictWith) {
        draft.records = draft.records.filter(record => record.id !== target.conflictWith);
      }
      target.state = 'active';
      delete target.conflictWith;
      target.confidence = 1;
      target.updatedAt = now;
      target.revision = draft.revision + 1;
      accepted.push(target.id);
    }
    return { status: accepted.length ? 'active' : 'not-found', count: accepted.length, ids: accepted };
  }, { ...options, purgeCopies: true });
}

export async function rejectPendingByIds(ids, options = {}) {
  const wanted = new Set(Array.isArray(ids) ? ids : []);
  if (wanted.size === 0) {
    return { value: { status: 'none', count: 0, ids: [] }, changed: false };
  }
  return mutateMemoryState(draft => {
    const removed = [];
    draft.records = draft.records.filter(record => {
      if (wanted.has(record.id) && record.state !== 'active') {
        removed.push(record.id);
        return false;
      }
      return true;
    });
    return {
      status: removed.length ? 'rejected' : 'not-found',
      count: removed.length,
      ids: removed,
    };
  }, { ...options, purgeCopies: true });
}
