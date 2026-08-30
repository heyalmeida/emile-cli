// header.js — ui/ module tree (extracted from the former src/ui.js monolith).
// See docs/architecture.md for the module map.
import { C, GAP, MAX_BOX_W, BOX_INDENT, getW, stripAnsi, wrapText, fmtK, boxTopOpen, boxBottomOpen } from './theme.js';
import { config } from '../config.js';
import { getModelInfo } from '../models.js';
import readline from 'node:readline';

// ──────────────────────────────────────────────────────────────
//  ZONA 1: Header — Banner + Session Info
// ──────────────────────────────────────────────────────────────

export function printHeader(version = '1.0.0') {
  const w = getW();

  console.log();
  // Open box: brand label between muted border parts (never nested in a
  // single C.muted wrapper — the label's RESET would kill the border color)
  process.stdout.write(`  ${C.muted('╭─')} ${C.bold(C.accent('✦  emile'))} ${C.muted(`v${version} `)}${C.muted('─'.repeat(Math.max(w - 16, 0)))}\n`);
  process.stdout.write(`${BOX_INDENT}${C.muted('Developer coding agent')}\n`);
  process.stdout.write(boxBottomOpen(w) + '\n');
  console.log();
}

export function printStartupScreen(version = '1.0.0') {
  const w = getW();
  console.log();
  process.stdout.write(`  ${C.muted('╭─')} ${C.bold(C.accent('✦  emile'))} ${C.muted(`v${version} `)}${C.muted('─'.repeat(Math.max(w - 16, 0)))}\n`);
  process.stdout.write(`${BOX_INDENT}${C.muted('Developer coding agent')}\n`);
  process.stdout.write(boxBottomOpen(w) + '\n');
  console.log();
}
