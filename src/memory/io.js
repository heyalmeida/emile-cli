import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { MAX_ARTIFACT_BYTES, MEMORY_FILES } from './constants.js';
import {
  ensureMemoryDirectory,
  ensurePrivateFile,
  getMemoryRoot,
  inspectMemoryEntry,
  resolveMemoryPath,
  syncDirectory,
} from './path.js';

function assertBounded(data) {
  if (Buffer.byteLength(data, 'utf8') > MAX_ARTIFACT_BYTES) {
    throw new Error('Memory artifact exceeds its size cap.');
  }
}

export function writeAtomicMemoryFile(root, name, data, { faultInjector, artifact = name } = {}) {
  assertBounded(data);
  const target = resolveMemoryPath(root, name);
  inspectMemoryEntry(target, { allowMissing: true });
  const tempName = `.${path.basename(name)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  const temporary = resolveMemoryPath(root, tempName);
  let fd;
  try {
    fd = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(fd, data, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    if (faultInjector) faultInjector(`${artifact}:temp-synced`);
    fs.renameSync(temporary, target);
    if (faultInjector) faultInjector(`${artifact}:renamed`);
    ensurePrivateFile(target);
    syncDirectory(path.dirname(target));
    if (faultInjector) faultInjector(`${artifact}:committed`);
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch { /* best-effort */ }
    if (fs.existsSync(temporary)) try { fs.unlinkSync(temporary); } catch { /* best-effort */ }
  }
}

export function appendMemoryWal(root, line, { faultInjector } = {}) {
  assertBounded(line);
  const walPath = resolveMemoryPath(root, MEMORY_FILES.wal);
  inspectMemoryEntry(walPath, { allowMissing: true });
  const flags = fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_CREAT |
    (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0);
  let fd;
  try {
    fd = fs.openSync(walPath, flags, 0o600);
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size + Buffer.byteLength(line, 'utf8') > MAX_ARTIFACT_BYTES) {
      throw new Error('Memory WAL is not a bounded regular file.');
    }
    fs.writeFileSync(fd, line, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch { /* best-effort */ }
  }
  ensurePrivateFile(walPath);
  if (faultInjector) faultInjector('wal:appended');
}

function purgeDirectory(directory, root) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = path.relative(getMemoryRoot(root), path.join(directory, entry.name));
    const target = resolveMemoryPath(root, relative);
    const stat = fs.lstatSync(target);
    if (stat.isDirectory() && !stat.isSymbolicLink()) {
      purgeDirectory(target, root);
      fs.rmdirSync(target);
    } else {
      fs.unlinkSync(target);
    }
  }
}

export function purgeMemoryQuarantine(root) {
  const directory = resolveMemoryPath(root, MEMORY_FILES.quarantine);
  if (!fs.existsSync(directory)) return;
  ensureMemoryDirectory(root, MEMORY_FILES.quarantine);
  purgeDirectory(directory, root);
  syncDirectory(directory);
}
