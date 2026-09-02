// recovery.js — startup scan of persisted sessions.
//
// Scans .emile/history/ for sessions left in 'pending' state (mid-tool crash,
// hard kill, power loss). Each is classified as:
//   recoverable — valid pending tool batch, all paths still inside workspace
//   corrupt    — everything else: malformed JSON, missing files, invalid paths
//
// The scan runs once on boot, before the REPL is shown. It never throws and
// never executes a tool. The RecoveryReport is returned to the caller.
//
// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { resolveSafePath } from './tools/security.js';

/**
 * @typedef {'recoverable' | 'corrupt'} SessionClassification
 * @typedef {object} ClassifiedSession
 * @property {string} sessionId
 * @property {SessionClassification} classification
 * @property {string} [reason]
 * @typedef {object} RecoveryReport
 * @property {number} sessionsScanned
 * @property {number} recoverable
 * @property {number} corrupt
 * @property {ClassifiedSession[]} classified
 * @property {Array<{ sessionId: string, error: string }>} scanErrors
 */

const FILE_PATH_KEYS = new Set([
  'file', 'filePath', 'path', 'filepath', 'filepath_', 'fspath',
  'dir', 'directory', 'target', 'source', 'output', 'outputPath', 'src', 'dst',
]);

/** Extracts string values from known path keys in a parsed JSON object. */
function filePathsIn(obj) {
  if (typeof obj === 'string') return [];
  if (Array.isArray(obj)) return obj.flatMap(filePathsIn);
  if (obj && typeof obj === 'object') {
    const out = [];
    for (const [k, v] of Object.entries(/** @type {Record<string,unknown>} */ (obj))) {
      if (FILE_PATH_KEYS.has(k) && typeof v === 'string' && v.length > 0) out.push(v);
      else out.push(...filePathsIn(v));
    }
    return out;
  }
  return [];
}

/** Classifies a single pending session record. */
function classify(record) {
  const id = record.id || '(unknown)';
  if (!Array.isArray(record.pendingToolCalls) || record.pendingToolCalls.length === 0) {
    return { sessionId: id, classification: 'corrupt', reason: 'pending session has no tool calls' };
  }
  for (const tc of record.pendingToolCalls) {
    if (!tc || typeof tc.id !== 'string') {
      return { sessionId: id, classification: 'corrupt', reason: 'tool call missing id' };
    }
    if (typeof tc.function?.name !== 'string') {
      return { sessionId: id, classification: 'corrupt', reason: 'tool call missing function.name' };
    }
    if (typeof tc.function?.arguments !== 'string') {
      return { sessionId: id, classification: 'corrupt', reason: 'tool call missing function.arguments' };
    }
    try {
      const args = JSON.parse(tc.function.arguments);
      for (const fp of filePathsIn(args)) resolveSafePath(fp);
    } catch {
      return { sessionId: id, classification: 'corrupt', reason: `invalid JSON or unsafe path in ${tc.function.name}` };
    }
  }
  return { sessionId: id, classification: 'recoverable' };
}

/**
 * Scan persisted sessions for pending checkpoints and classify each one.
 * @param {{ sessionsDir?: string, workspaceDir?: string }} [opts]
 * @returns {Promise<RecoveryReport>}
 */
export async function runStartupRecovery({ sessionsDir } = {}) {
  const scanDir = sessionsDir || path.join(config.workspaceDir ?? process.cwd(), '.emile', 'history');
  const report = { sessionsScanned: 0, recoverable: 0, corrupt: 0, classified: [], scanErrors: [] };
  let entries;
  try { entries = fs.readdirSync(scanDir); } catch { return report; }

  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const filePath = path.join(scanDir, entry);
    const sessionId = entry.replace(/\.json$/, '');
    report.sessionsScanned++;
    try {
      const record = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (record.status !== 'pending') continue;
      const c = classify(record);
      report.classified.push(c);
      report[c.classification]++;
    } catch (err) {
      report.scanErrors.push({ sessionId, error: err.message });
      report.classified.push({ sessionId, classification: 'corrupt', reason: `scan error: ${err.message}` });
      report.corrupt++;
    }
  }
  return report;
}
