// undo-stack.js — in-memory LRU undo stack with configurable cap.
// @ts-check

const UNDO_STACK_LIMIT = 50;

/** @type {Array<{ path: string, content: string|null, ts: number }>} */
export const undoStack = [];

let cap = UNDO_STACK_LIMIT;

/**
 * Push an entry onto the stack, discarding the oldest if over cap.
 * @param {{ path: string, content: string|null }} entry
 */
export function push(entry) {
  undoStack.push({ ...entry, ts: Date.now() });
  while (undoStack.length > cap) undoStack.shift();
}

/**
 * Pops and returns the most recent entry, or null if the stack is empty.
 * @returns {{ path: string, content: string|null, ts: number } | null}
 */
export function pop() {
  return undoStack.pop() ?? null;
}

/** Returns the current stack depth. */
export function depth() {
  return undoStack.length;
}

/**
 * Sets the per-session cap. Default is 50.
 * @param {number} n
 */
export function setCap(n) {
  cap = Math.max(1, n);
  while (undoStack.length > cap) undoStack.shift();
}

/** Clears the entire stack. */
export function clear() {
  undoStack.length = 0;
}

/** Returns a copy of the current stack (newest last). */
export function snapshot() {
  return [...undoStack];
}

/** Replaces the stack with the given entries (newest last). */
export function rehydrate(entries) {
  undoStack.length = 0;
  for (const e of entries) undoStack.push(e);
  while (undoStack.length > cap) undoStack.shift();
}
