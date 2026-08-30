// config-panel.js — ui/ module tree (extracted from the former src/ui.js monolith).
// See docs/architecture.md for the module map.
import { C, GAP, MAX_BOX_W, BOX_INDENT, getW, stripAnsi, wrapText, fmtK, boxTopOpen, boxBottomOpen } from './theme.js';
import { config } from '../config.js';
import { getModelInfo } from '../models.js';
import readline from 'node:readline';

/**
 * Renders the open configuration card:
 * ┌─ Configuration ─────────────────
 *     provider    openrouter
 *     model       claude-3.5-sonnet  (low)
 *     cache       off      safe-gate  off
 * └──────────────────────────────────
 */
export function printConfigBox({ provider, model, cache, effort, plans, dryRun, safeMode }) {
  const shortModel = model.split('/').pop();
  const cols = process.stdout.columns || 80;
  const boxW = Math.min(cols - 4, 62);

  const KEY_W = 12; // fixed key column width for alignment

  // Helper: renders one key=value cell, left-padded to keyW, value styled
  function cell(key, val) {
    return C.muted(key.padEnd(KEY_W)) + val;
  }

  process.stdout.write(boxTopOpen('Configuration', boxW) + '\n');

  // provider
  process.stdout.write(`${BOX_INDENT}${cell('provider', C.bold(C.fg(provider)))}\n`);

  // model
  const modelVal = C.bold(C.accent(shortModel)) + (effort ? C.muted(` (${effort})`) : '');
  process.stdout.write(`${BOX_INDENT}${cell('model', modelVal)}\n`);

  // cache + safe-gate on same row (two-column layout)
  // "off" is a state, not an error — dim it instead of red (visual identity)
  const cacheVal  = cache    ? C.success('on')  : C.dim('off');
  const safeVal   = safeMode ? C.success('on')  : C.dim('off');
  const leftCell  = cell('cache', cacheVal);
  const rightCell = C.muted('safe-gate'.padEnd(KEY_W)) + safeVal;
  const leftVis   = stripAnsi(leftCell).length;
  const colGap    = Math.max(boxW - 8 - leftVis - stripAnsi(rightCell).length, 2);
  process.stdout.write(`${BOX_INDENT}${leftCell}${' '.repeat(colGap)}${rightCell}\n`);

  // optional mode rows
  if (plans)  process.stdout.write(`${BOX_INDENT}${cell('mode', C.warn('plans'))}\n`);
  if (dryRun) process.stdout.write(`${BOX_INDENT}${cell('mode', C.red('dry-run'))}\n`);

  process.stdout.write(boxBottomOpen(boxW) + '\n');
  console.log();
}

// Keep old name as alias for backward compat (used by /connect refresh etc.)
export const printConfig = printConfigBox;
