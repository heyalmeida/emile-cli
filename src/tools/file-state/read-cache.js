// read-cache.js — in-memory file read cache (invalidated on write).
// @ts-check

/** File content cache: path → { content, mtimeMs } */
const fileCache = new Map();

/**
 * Returns cached content if the file has not been modified since the cache entry.
 * Returns null if the file is not cached or was modified.
 * @param {string} filePath
 * @returns {string|null}
 */
export function readFileCached(filePath) {
  const stat = fileCache.get(filePath);
  if (!stat) return null;
  try {
    const mtime = fs.statSync(filePath).mtimeMs;
    if (mtime !== stat.mtimeMs) return null; // file changed on disk
  } catch {
    return null;
  }
  return stat.content;
}

/**
 * Stores content in the read cache with its current mtime.
 * @param {string} filePath
 * @param {string} content
 */
export function cacheFile(filePath, content) {
  try {
    const mtime = fs.statSync(filePath).mtimeMs;
    fileCache.set(filePath, { content, mtimeMs: mtime });
  } catch {
    // File may not exist yet (write path) — don't cache.
  }
}

/**
 * Invalidates the cache entry for a file (call after write/edit).
 * @param {string} filePath
 */
export function invalidateCache(filePath) {
  fileCache.delete(filePath);
}

/**
 * Clears the entire read cache. Called between agent turns.
 */
export function clearCache() {
  fileCache.clear();
}

// Lazy import to avoid a cycle with config.js
import fs from 'node:fs';
