// response.js — ui/ module tree (extracted from the former src/ui.js monolith).
// See docs/architecture.md for the module map.
import { C, GAP, MAX_BOX_W, BOX_INDENT, getW, stripAnsi, wrapText, fmtK, boxTopOpen, boxBottomOpen } from './theme.js';
import { sanitizeAssistantOutput } from './sanitize.js';
import { config } from '../config.js';
import { getModelInfo } from '../models.js';
import { turnState } from './turn-state.js';
import { renderMarkdown } from './markdown.js';
import readline from 'node:readline';


// Opt-in diagnostic: print Assistant response render summary.
const DEBUG = process.env.EMILE_DEBUG_THINKING === '1';
function debugPrintResponse(prefix, content) {
  if (!DEBUG) return;
  const sample = content.slice(0, 60).replace(/\n/g, ' ');
  process.stderr.write(`[printAssistantResponse] ${prefix} len=${content.length} sample=${JSON.stringify(sample)}\n`);
}

/**
 * Prints the AI response inside an open box (top/bottom borders only).
 * Text is wrapped to the content width BEFORE markdown rendering so it
 * never wraps mid-render, and the 4-space indent keeps it off the margin.
 *
 * ╭─ emile ──────────────────────────────────────
 *
 *     Text wrapped to the content width.
 *
 * ╰───────────────────────────────────────────────
 */
export function printAssistantResponse(content) {
  debugPrintResponse('enter', content);
  const sanitized = sanitizeAssistantOutput(content).trim();
  debugPrintResponse('sanitized', sanitized);
  if (!sanitized) { debugPrintResponse('skip-empty', sanitized); return; }

  const cols  = process.stdout.columns || 80;
  // Most of the terminal width, capped at 120 columns (premium pass 4:
  // 88 was too narrow for real code discussions)
  const boxW  = Math.min(cols - 4, MAX_BOX_W);
  const wrapW = boxW - BOX_INDENT.length; // content wraps inside the 4-space indent

  // Dim tool-count header — the only status line of the turn (replaces the
  // old "✓ N tools completed" footer). Consumes the counter.
  if (turnState.toolsRun > 0) {
    const label = turnState.toolsRun === 1 ? '1 tool' : `${turnState.toolsRun} tools`;
    process.stdout.write(GAP.section);
    process.stdout.write(`  ${C.dim(`↳ ${label}`)}\n`);
    turnState.toolsRun = 0;
  }

  // Leading blank line: exactly one gap between this box and the block above
  console.log();

  // Open box top — ANSI parts composed separately: the accent label's RESET
  // must never kill the muted color of the dashes after it
  process.stdout.write(`  ${C.muted('╭─')} ${C.bold(C.accent('emile'))} ${C.muted('─'.repeat(Math.max(boxW - 10, 0)))}\n`);

  // Inner top padding — breathing room under the border
  console.log();

  // Pre-wrap each raw paragraph line to wrapW BEFORE markdown rendering
  const prewrapped = sanitized
    .split('\n')
    .flatMap(rawLine => {
      if (rawLine.trim() === '') return [''];
      // Don't wrap code fence lines — leave them for markdown renderer
      if (rawLine.trimStart().startsWith('```')) return [rawLine];
      return wrapText(rawLine, wrapW);
    })
    .join('\n');

  const rendered = renderMarkdown(prewrapped);
  if (rendered) {
    for (const line of rendered.split('\n')) {
      process.stdout.write(`${BOX_INDENT}${line}\n`);
    }
  }

  // Inner bottom padding + open box bottom
  console.log();
  process.stdout.write(boxBottomOpen(boxW) + '\n');
}
