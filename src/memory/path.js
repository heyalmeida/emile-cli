import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MAX_ARTIFACT_BYTES } from './constants.js';
import { resolveSafePath } from '../tools/security.js';

export function getMemoryRoot(root) {
  return path.resolve(root || path.join(os.homedir(), '.emile', 'memory', 'v1'));
}

function assertDirectory(directory) {
  const stat = fs.lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error('Memory path contains an unsafe directory entry.');
  }
}

export function ensureMemoryRoot(root) {
  const target = getMemoryRoot(root);
  const homeAnchor = root ? target : path.resolve(os.homedir());
  if (!root && fs.existsSync(homeAnchor)) assertDirectory(homeAnchor);
  if (!root) {
    let current = homeAnchor;
    for (const segment of path.relative(homeAnchor, target).split(path.sep).filter(Boolean)) {
      current = path.join(current, segment);
      if (fs.existsSync(current)) assertDirectory(current);
    }
  }
  const missing = [];
  let cursor = target;
  while (!fs.existsSync(cursor)) {
    missing.push(cursor);
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  if (fs.existsSync(cursor)) assertDirectory(cursor);
  for (const directory of missing.reverse()) {
    try { fs.mkdirSync(directory, { mode: 0o700 }); }
    catch (error) { if (error?.code !== 'EEXIST') throw error; }
    assertDirectory(directory);
    try { fs.chmodSync(directory, 0o700); } catch { /* unsupported permissions */ }
  }
  assertDirectory(target);
  return fs.realpathSync(target);
}

export function ensureMemoryDirectory(root, name) {
  const target = resolveMemoryPath(root, name);
  if (!fs.existsSync(target)) {
    try { fs.mkdirSync(target, { mode: 0o700 }); }
    catch (error) { if (error?.code !== 'EEXIST') throw error; }
  }
  assertDirectory(target);
  const realRoot = fs.realpathSync(getMemoryRoot(root));
  const realTarget = fs.realpathSync(target);
  const relative = path.relative(realRoot, realTarget);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Memory directory escapes its capability root.');
  }
  try { fs.chmodSync(target, 0o700); } catch { /* unsupported permissions */ }
  return target;
}

export function resolveMemoryPath(root, ...segments) {
  const resolvedRoot = getMemoryRoot(root);
  if (segments.some(segment => typeof segment !== 'string' || !segment || segment.includes('\0'))) {
    throw new Error('Invalid memory path component.');
  }
  const target = path.resolve(resolvedRoot, ...segments);
  return resolveSafePath(target, {
    root: resolvedRoot,
    label: 'memory root',
    preserveFinalEntry: true,
  });
}

export function inspectMemoryEntry(filePath, { allowMissing = true, maxBytes = MAX_ARTIFACT_BYTES } = {}) {
  if (!fs.existsSync(filePath)) {
    if (allowMissing) return null;
    throw new Error('Required memory artifact is missing.');
  }
  const stat = fs.lstatSync(filePath);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error('Memory artifact is not a regular file.');
  }
  if (stat.size > maxBytes) throw new Error('Memory artifact exceeds its size cap.');
  return stat;
}

export function readRegularMemoryFile(filePath, { maxBytes = MAX_ARTIFACT_BYTES } = {}) {
  inspectMemoryEntry(filePath, { allowMissing: false, maxBytes });
  const flags = fs.constants.O_RDONLY |
    (fs.constants.O_NOFOLLOW || 0) |
    (fs.constants.O_NONBLOCK || 0);
  let fd;
  try {
    fd = fs.openSync(filePath, flags);
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > maxBytes) throw new Error('Memory artifact is not a bounded regular file.');
    return fs.readFileSync(fd, 'utf8');
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch { /* best-effort */ }
  }
}

export function ensurePrivateFile(filePath) {
  try { fs.chmodSync(filePath, 0o600); } catch { /* best-effort on non-POSIX filesystems */ }
}

export function syncDirectory(directory) {
  let fd;
  try {
    fd = fs.openSync(directory, 'r');
    fs.fsyncSync(fd);
  } catch { /* unsupported on some filesystems/platforms */ }
  finally { if (fd !== undefined) try { fs.closeSync(fd); } catch { /* best-effort */ } }
}
