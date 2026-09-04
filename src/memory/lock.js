import fs from 'node:fs';
import crypto from 'node:crypto';
import { MEMORY_FILES } from './constants.js';
import { inspectMemoryEntry, resolveMemoryPath } from './path.js';

const RETRIES = 8;
const RETRY_MS = 25;
const STALE_MS = 15_000;
const FORCE_STALE_MS = 120_000;

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function processIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function readLock(lockPath) {
  inspectMemoryEntry(lockPath, { allowMissing: false, maxBytes: 2048 });
  const parsed = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  if (!parsed || typeof parsed.token !== 'string' || !Number.isFinite(parsed.createdAt)) {
    throw new Error('Memory lock is malformed.');
  }
  return parsed;
}

function reclaimIfStale(lockPath) {
  let lock;
  try { lock = readLock(lockPath); } catch { return false; }
  const age = Date.now() - lock.createdAt;
  if (age <= STALE_MS || (processIsAlive(lock.pid) && age <= FORCE_STALE_MS)) return false;
  try {
    const current = readLock(lockPath);
    if (current.token !== lock.token) return false;
    fs.unlinkSync(lockPath);
    return true;
  } catch { return false; }
}

export async function acquireMemoryLock(root, { retries = RETRIES } = {}) {
  const lockPath = resolveMemoryPath(root, MEMORY_FILES.lock);
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const token = crypto.randomBytes(16).toString('hex');
    let fd;
    try {
      fd = fs.openSync(lockPath, 'wx', 0o600);
      fs.writeFileSync(fd, JSON.stringify({ token, pid: process.pid, createdAt: Date.now() }), 'utf8');
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      return { lockPath, token };
    } catch (error) {
      if (fd !== undefined) try { fs.closeSync(fd); } catch { /* best-effort */ }
      if (error?.code !== 'EEXIST') throw error;
      if (reclaimIfStale(lockPath)) {
        attempt -= 1;
        continue;
      }
      if (attempt === retries) throw new Error('Memory store is busy; retry later.');
      await delay(RETRY_MS * (attempt + 1));
    }
  }
  throw new Error('Memory store is busy; retry later.');
}

export function releaseMemoryLock(lock) {
  if (!lock?.lockPath || !lock?.token) return;
  try {
    const current = readLock(lock.lockPath);
    if (current.token === lock.token) fs.unlinkSync(lock.lockPath);
  } catch { /* another owner or already released */ }
}

export async function withMemoryLock(root, callback, options) {
  const lock = await acquireMemoryLock(root, options);
  try { return await callback(); }
  finally { releaseMemoryLock(lock); }
}
