import fs from 'node:fs';
import path from 'node:path';
import { confirm, isCancel } from '@clack/prompts';
import {
  acceptGlobalMemory,
  assessMemoryText,
  clearGlobalMemories,
  diagnoseGlobalMemory,
  forgetGlobalMemories,
  getGlobalMemoryStatus,
  isMemoryPaused,
  listGlobalMemories,
  rejectGlobalMemory,
  rememberGlobalMemory,
  setGlobalMemoryMode,
  setMemoryPaused,
  setMemorySkipConfirm,
} from '../memory/index.js';
import { resolveSafePath } from '../tools/security.js';
import { printMemoryDoctor, printMemoryNotice, printMemoryRecords, printMemoryStatus } from '../ui/index.js';

function options(ctx) {
  return { root: ctx.memoryRoot, dryRun: ctx.config?.dryRun === true, sessionId: ctx.getSessionId?.() || `session_${Date.now()}` };
}
function confirmer(ctx) { return ctx.confirmMemoryAction || confirm; }
function valueMessage(result, action) {
  if (result.simulated) return `${action} simulated; dry-run wrote nothing.`;
  const value = result.value || {};
  if (value.status === 'disabled') return 'Memory is off or paused.';
  if (value.status === 'not-found') return 'Memory record was not found.';
  return `${action}: ${value.id || value.status || 'done'}.`;
}

export async function handleRemember(ctx, args = []) {
  const text = args.join(' ').trim();
  if (!text) return printMemoryNotice('Usage: /remember <preference or workflow>', 'warn');
  const assessment = assessMemoryText(text);
  if (assessment.level === 'denied') return printMemoryNotice(`Memory rejected (${assessment.code}).`, 'warn');
  let allowSensitive = false;
  if (assessment.level === 'sensitive') {
    const approved = await confirmer(ctx)({
      message: 'This memory may contain sensitive personal information. Store it locally?',
      active: 'Store it', inactive: 'Cancel',
    });
    if (isCancel(approved) || !approved) return printMemoryNotice('Memory was not stored.');
    allowSensitive = true;
  }
  try {
    const result = await rememberGlobalMemory(text, { ...options(ctx), allowSensitive });
    printMemoryNotice(valueMessage(result, 'Memory'), result.value?.status === 'active' ? 'success' : 'warn');
  } catch { printMemoryNotice('Memory is unavailable; nothing was stored.', 'warn'); }
}

export async function handleForget(ctx, args = []) {
  const selector = args.join(' ').trim();
  if (!selector) return printMemoryNotice('Usage: /forget <id or query>', 'warn');
  let found;
  try { found = listGlobalMemories(selector, options(ctx)).records; }
  catch { return printMemoryNotice('Memory is unavailable; nothing was forgotten.', 'warn'); }
  const exact = found.find(record => record.id === selector);
  const targets = exact ? [exact] : found;
  if (!targets.length) return printMemoryNotice('No matching memory was found.', 'warn');
  if (!exact) {
    printMemoryRecords(targets, { title: 'Memories to forget' });
    const approved = await confirmer(ctx)({ message: `Forget ${targets.length} matching memory record(s)?`, active: 'Forget', inactive: 'Cancel' });
    if (isCancel(approved) || !approved) return printMemoryNotice('No memory was changed.');
  }
  try {
    const result = await forgetGlobalMemories(targets.map(record => record.id), options(ctx));
    printMemoryNotice(valueMessage(result, 'Forgotten'), 'success');
    printMemoryNotice('Application copies were purged; storage-media secure erasure is not guaranteed.', 'warn');
  } catch { printMemoryNotice('Forget did not complete across every managed copy.', 'warn'); }
}

function exportRecords(ctx, filename) {
  const records = listGlobalMemories('', options(ctx)).records.map(record => ({
    id: record.id, type: record.type, state: record.state, key: record.key, text: record.text,
    tags: record.tags, activation: record.activation, sensitivity: record.sensitivity,
  }));
  const target = resolveSafePath(filename, { root: ctx.config.workspaceDir, label: 'workspace' });
  if (fs.existsSync(target)) throw new Error('Export destination already exists.');
  const temporary = resolveSafePath(`.${path.basename(filename)}.${process.pid}.tmp`, {
    root: path.dirname(target), label: 'export directory',
  });
  let fd;
  try {
    fd = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(fd, `${JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), records }, null, 2)}\n`, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.linkSync(temporary, target);
    fs.unlinkSync(temporary);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (fs.existsSync(temporary)) try { fs.unlinkSync(temporary); } catch { /* best-effort */ }
  }
  try { fs.chmodSync(target, 0o600); } catch { /* best-effort */ }
  return path.relative(ctx.config.workspaceDir, target);
}

async function handleMemoryMutation(ctx, operation, id) {
  if (!id) return printMemoryNotice(`Usage: /memory ${operation} <id>`, 'warn');
  const fn = operation === 'accept' ? acceptGlobalMemory : rejectGlobalMemory;
  try { printMemoryNotice(valueMessage(await fn(id, options(ctx)), `Memory ${operation}ed`), 'success'); }
  catch { printMemoryNotice(`Memory ${operation} failed.`, 'warn'); }
}

export async function handleMemory(ctx, args = []) {
  const operation = String(args[0] || '').toLowerCase();
  try {
    if (!operation || operation === 'status') return printMemoryStatus(getGlobalMemoryStatus(options(ctx)));
    if (operation === 'list') return printMemoryRecords(listGlobalMemories(args.slice(1).join(' '), options(ctx)).records);
    if (operation === 'show') return printMemoryRecords(listGlobalMemories(args[1] || '', options(ctx)).records.filter(record => record.id === args[1]), { title: 'Memory detail' });
    if (operation === 'mode') {
      const mode = String(args[1] || '');
      const result = await setGlobalMemoryMode(mode, options(ctx));
      return printMemoryNotice(valueMessage(result, `Memory mode ${mode}`), 'success');
    }
    if (operation === 'pause' || operation === 'resume') {
      setMemoryPaused(operation === 'pause');
      return printMemoryNotice(`Memory session ${isMemoryPaused() ? 'paused' : 'resumed'}.`, 'success');
    }
    if (operation === 'confirm-on') {
      setMemorySkipConfirm(false);
      return printMemoryNotice('Memory pending-confirm modal enabled.', 'success');
    }
    if (operation === 'confirm-off') {
      setMemorySkipConfirm(true);
      return printMemoryNotice('Memory pending-confirm modal disabled for this process.', 'success');
    }
    if (operation === 'accept' || operation === 'reject') return handleMemoryMutation(ctx, operation, args[1]);
    if (operation === 'doctor') return printMemoryDoctor({ ...diagnoseGlobalMemory(options(ctx)), paused: isMemoryPaused() });
    if (operation === 'clear') {
      const approved = await confirmer(ctx)({ message: 'Clear every global memory and recovery copy?', active: 'Clear all', inactive: 'Cancel' });
      if (isCancel(approved) || !approved) return printMemoryNotice('No memory was changed.');
      const result = await clearGlobalMemories(options(ctx));
      printMemoryNotice(valueMessage(result, 'Memory cleared'), 'success');
      return printMemoryNotice('Application copies were purged; storage-media secure erasure is not guaranteed.', 'warn');
    }
    if (operation === 'export') {
      const filename = args[1] || `emile-memory-${Date.now()}.json`;
      const approved = await confirmer(ctx)({ message: `Export global memory to ${filename}?`, active: 'Export', inactive: 'Cancel' });
      if (isCancel(approved) || !approved) return printMemoryNotice('Memory was not exported.');
      if (ctx.config.dryRun) return printMemoryNotice('Memory export simulated; dry-run wrote nothing.');
      return printMemoryNotice(`Memory exported to ${exportRecords(ctx, filename)}.`, 'success');
    }
    return printMemoryNotice('Usage: /memory [status|list|show|mode|pause|resume|accept|reject|doctor|export|clear]', 'warn');
  } catch { return printMemoryNotice('Memory command failed without changing agent availability.', 'warn'); }
}
