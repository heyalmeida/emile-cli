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
