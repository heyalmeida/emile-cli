// path.js — hash, entry ID, and realpath containment helpers for undo persistence.
// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../../config.js';

/**
 * Returns a stable hash of the given content string.
 * Used to detect whether a file changed since the undo snapshot was taken.
 * @param {string} content
 * @returns {string}
 */
export function hashContent(content) {
  // Simple djb2 — fast and deterministic; collision probability is acceptable
  // for this use case (detecting unintended change, not security).
  let hash = 5381;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) + hash) ^ content.charCodeAt(i);
    hash = hash >>> 0; // keep unsigned 32-bit
  }
  return hash.toString(16);
}

/**
 * Returns a short unique ID for an undo entry.
 * @returns {string}
 */
export function entryId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Checks whether a resolved path stays inside the undo dir.
 * Rejects symlinks that escape the undo root.
 * @param {string} candidatePath
 * @param {string} undoDir — e.g. .emile/undo/<sessionId>
 * @returns {boolean}
 */
export function isInsideUndoDir(candidatePath, undoDir) {
  const undoReal = fs.realpathSync(undoDir); // throws if undoDir doesn't exist
  const candidateReal = fs.realpathSync(candidatePath);
  const rel = path.relative(undoReal, candidateReal);
  return !(rel.startsWith('..') || path.isAbsolute(rel));
}
