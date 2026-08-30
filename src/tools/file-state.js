// file-state.js — shared tool state: read cache + undo stack.

export const fileCache = new Map();

// Rollback stack for the /undo command. Capped at 50 entries — the oldest
// entry is discarded once the cap is reached (IMPROVEMENTS.md §1.5; the cap
// was previously documented but not enforced).
export const UNDO_STACK_LIMIT = 50;
export const undoStack = [];

/**
 * Pushes an undo entry, trimming the oldest when over the cap.
 * @param {{ path: string, content: string|null }} entry
 */
export function pushUndo(entry) {
  undoStack.push(entry);
  if (undoStack.length > UNDO_STACK_LIMIT) undoStack.shift();
}

// Exported helper to clear the read cache between agent execution turns
export function clearFileCache() {
  fileCache.clear();
}

