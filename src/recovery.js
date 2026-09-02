// recovery.js — startup scan of persisted sessions.
//
// Scans .emile/history/ for sessions left in 'pending' state (mid-tool
// crash, hard kill, power loss). Each is classified as:
//   recoverable  — valid pending tool batch, all paths still inside workspace
//   abandoned   — explicitly marked abandoned (future; not set by this module)
//   corrupt    — everything else: malformed JSON, missing files, invalid paths
//
// The scan runs once on boot, before the REPL is shown. It never throws and
// never executes a tool. The RecoveryReport is returned to the caller; the
// CLI decides what to surface to the user.
//
// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { resolveSafePath } from './tools/security.js';

/**
 * @typedef {'recoverable' | 'abandoned' | 'corrupt'} SessionClassification
 *
 * @typedef {object} ClassifiedSession
 * @property {string} sessionId
 * @property {SessionClassification} classification
 * @property {string} [reason]
 *
 * @typedef {object} RecoveryReport
 * @property {number} sessionsScanned
 * @property {number} recoverable
 * @property {number} abandoned
 * @property {number} corrupt
 * @property {ClassifiedSession[]} classified
 * @property {Array<{ sessionId: string, error: string }>} scanErrors
 */

// ── Path extraction helpers ──────────────────────────────────────────────────

const FILE_PATH_KEYS = new Set(['file', 'filePath', 'path', 'filepath', 'filepath_', 'fspath', 'dir', 'directory', 'target', 'source', 'output', 'outputPath', 'src', 'dst']);

/**
 * Extracts plain string file paths from a JSON object, recursively.
 * Returns an empty array if parsing fails.
 * @param {unknown} obj
 * @returns {string[]}
 */
function extractFilePaths(obj) {
  if (typeof obj === 'string') return [];
  if (Array.isArray(obj)) return obj.flatMap(extractFilePaths);
  if (obj && typeof obj === 'object') {
    const paths = [];
    for (const [key, val] of Object.entries(/** @type {Record<string,unknown>} */ (obj))) {
      if (FILE_PATH_KEYS.has(key) && typeof val === 'string' && val.length > 0) {
        paths.push(val);
      } else {
        paths.push(...extractFilePaths(val));
      }
    }
    return paths;
  }
  return [];
}

// ── Classification ──────────────────────────────────────────────────────────

/**
 * Classifies a single pending session.
 * @param {object} record — from getSessionRecord()
 * @param {string} workspaceDir
 * @returns {ClassifiedSession}
 */
function classify(record, workspaceDir) {
  const id = record.id || '(unknown)';

  if (!Array.isArray(record.pendingToolCalls) || record.pendingToolCalls.length === 0) {
    return { sessionId: id, classification: 'corrupt', reason: 'pending session has no tool calls' };
  }

  for (const toolCall of record.pendingToolCalls) {
    if (!toolCall || typeof toolCall.id !== 'string') {
      return { sessionId: id, classification: 'corrupt', reason: 'tool call missing id' };
    }
    if (typeof toolCall.function?.name !== 'string') {
      return { sessionId: id, classification: 'corrupt', reason: 'tool call missing function.name' };
    }
    if (typeof toolCall.function?.arguments !== 'string') {
      return { sessionId: id, classification: 'corrupt', reason: 'tool call missing function.arguments' };
    }

    // Try to extract file paths from the JSON arguments.
    try {
      const args = JSON.parse(toolCall.function.arguments);
      const filePaths = extractFilePaths(args);
      for (const fp of filePaths) {
        // validate each path — resolveSafePath throws if outside workspace.
        resolveSafePath(fp);
      }
    } catch {
      return { sessionId: id, classification: 'corrupt', reason: `invalid JSON or unsafe path in ${toolCall.function.name}` };
    }
  }

  return { sessionId: id, classification: 'recoverable' };
}

// ── Public API ───────────────────────────────────────────────────────────────

const historyDir = path.join(config.workspaceDir, '.emile', 'history');

/**
 * Scan persisted sessions for pending checkpoints and classify each one.
 *
 * @param {{ sessionsDir?: string, workspaceDir?: string, verbose?: boolean }} [opts]
 * @returns {Promise<RecoveryReport>}
 */
export async function runStartupRecovery({ sessionsDir = historyDir, workspaceDir = config.workspaceDir } = {}) {
  /** @type {RecoveryReport} */
  const report = {
    sessionsScanned: 0,
    recoverable: 0,
    abandoned: 0,
    corrupt: 0,
    classified: [],
    scanErrors: [],
  };

  let entries;
  try {
    entries = fs.readdirSync(sessionsDir);
  } catch (err) {
    // Best-effort: if the history dir doesn't exist, nothing to recover.
    return report;
  }

  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const filePath = path.join(sessionsDir, entry);
    const sessionId = entry.replace(/\.json$/, '');
    report.sessionsScanned++;

    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const record = JSON.parse(raw);

      if (record.status !== 'pending') continue; // not our concern

      const classified = classify(record, workspaceDir);
      report.classified.push(classified);
      report[classified.classification]++;
    } catch (err) {
      // Malformed JSON or unreadable file — classify as corrupt.
      report.scanErrors.push({ sessionId, error: err.message });
      report.classified.push({ sessionId, classification: 'corrupt', reason: `scan error: ${err.message}` });
      report.corrupt++;
    }
  }

  return report;
}
