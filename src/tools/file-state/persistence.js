// persistence.js — undo stack mirror to .emile/undo/<sessionId>/.
// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../../config.js';
import { hashContent, entryId, isInsideUndoDir } from './path.js';
import { warn } from '../../ui/log.js';

const UNDO_DIR = () => path.join(config.workspaceDir, '.emile', 'undo');

function undoDir(sessionId) {
  return path.join(UNDO_DIR(), sessionId);
}

function entryPath(sessionId, id) {
  return path.join(undoDir(sessionId), `${id}.json`);
}

/**
 * Appends an undo entry to disk atomically (write + rename).
 * Refuses to follow symlinks that escape the undo dir.
 * @param {string} sessionId
 * @param {{ path: string, content: string|null }} entry
 * @param {string} entryEntryId — already-generated ID
 */
export function append(sessionId, entry, entryEntryId) {
  const dir = undoDir(sessionId);
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* best-effort */ }

  const target = entryPath(sessionId, entryEntryId);
  // Refuse to write if the real path escapes the undo dir.
  try {
    const real = fs.realpathSync(dir);
    const targetResolved = path.resolve(dir, `${entryEntryId}.json`);
    if (!targetResolved.startsWith(real)) {
      warn(`[undo] refused: path escapes .emile/undo/: ${targetResolved}`);
      return false;
    }
  } catch {
    // dir doesn't exist yet; that's fine.
  }

  const data = JSON.stringify({
    id: entryEntryId,
    path: entry.path,
    content: entry.content,
    hash: entry.content !== null ? hashContent(entry.content) : null,
    ts: Date.now(),
  });

  // Atomic write: temp file → rename.
  const tmp = `${target}.tmp.${Date.now()}`;
  try {
    fs.writeFileSync(tmp, data, 'utf8');
    fs.renameSync(tmp, target);
    return true;
  } catch (err) {
    warn(`[undo] failed to persist entry: ${err.message}`);
    try { fs.unlinkSync(tmp); } catch { /* best-effort */ }
    return false;
  }
}

/**
 * Loads the undo stack from disk for a given session (newest last).
 * Returns at most `cap` entries.
 * @param {string} sessionId
 * @param {number} [cap]
 * @returns {Array<object>}
 */
export function rehydrate(sessionId, cap = 50) {
  const dir = undoDir(sessionId);
  let files;
  try {
    files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  } catch {
    return [];
  }

  const entries = [];
  for (const file of files) {
    const filePath = path.join(dir, file);
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.path === 'string') {
        entries.push(parsed);
      }
    } catch {
      // Best-effort: skip corrupt entries.
    }
  }

  // Sort newest first.
  entries.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return entries.slice(0, cap);
}

/**
 * Removes all undo files for a session.
 * @param {string} sessionId
 */
export function clearSession(sessionId) {
  const dir = undoDir(sessionId);
  try {
    for (const file of fs.readdirSync(dir)) {
      try { fs.unlinkSync(path.join(dir, file)); } catch { /* best-effort */ }
    }
    fs.rmdirSync(dir);
  } catch {
    // Best-effort.
  }
}
