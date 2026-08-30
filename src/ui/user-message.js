// user-message.js — ui/ module tree (extracted from the former src/ui.js monolith).
// See docs/architecture.md for the module map.
import { C, GAP, MAX_BOX_W, BOX_INDENT, getW, stripAnsi, wrapText, fmtK, boxTopOpen, boxBottomOpen } from './theme.js';
import { config } from '../config.js';
import { turnState } from './turn-state.js';
import { getModelInfo } from '../models.js';
import readline from 'node:readline';

// ──────────────────────────────────────────────────────────────
//  ZONA 2: Chat Canvas Components
// ──────────────────────────────────────────────────────────────

/**
 * Prints the user message as a command divider — the visual "chapter" marker
 * of a new turn:
 *
 *   ── Add input validation to src/api.js ─────────────────────
 *
 * Message text in fg, dashes in muted, truncated to the terminal width.
 * Also resets the turn's tool counter (a new command starts a new turn).
 */
export function printUserMessage(text) {
  // New user command = new turn: drop any unconsumed tool count
  turnState.toolsRun = 0;

  const cols = process.stdout.columns || 80;
  const width = Math.min(cols - 4, MAX_BOX_W);
  const maxText = Math.max(width - 6, 10);
  const message = (text || '').replace(/\r?\n/g, ' ');
  const shown = message.length > maxText
    ? message.substring(0, maxText - 1) + '…'
    : message;

  // Leading blank line: exactly one gap between this divider and the block above
  console.log();
  if (shown) {
    const used = shown.length + 4; // '── ' + ' '
    const rest = Math.max(width - used, 0);
    process.stdout.write(`  ${C.muted('── ')}${C.fg(shown)} ${C.muted('─'.repeat(rest))}\n`);
  } else {
    process.stdout.write(`  ${C.muted('─'.repeat(width))}\n`);
  }
  // No trailing blank — the next block (thinking, tools, response) owns the
  // single leading gap (vertical rhythm rule).
}
