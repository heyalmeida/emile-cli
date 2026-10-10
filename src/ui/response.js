// response.js — ui/ module tree (extracted from the former src/ui.js monolith).
// See docs/architecture.md for the module map.
import { C, ROLE, GAP, MAX_BOX_W, BOX_INDENT, getW, stripAnsi, wrapText, fmtK, boxTopOpen, boxBottomOpen } from './theme.js';
import { sanitizeAssistantOutput } from './sanitize.js';
import { config } from '../config.js';
import { getModelInfo } from '../models.js';
import { turnState } from './turn-state.js';
import { renderMarkdown } from './markdown.js';
import { createFrontier } from './commit-frontier.js';
import readline from 'node:readline';

// A completed response is FINAL the moment it is printed: it is committed once
// through the frontier (print-once, one write, synchronized on a TTY) instead of
// being re-emitted line by line. `write` stays a thunk so the ADR-0003 stdout
// lease in `turn-keys.js` keeps arbitrating this write like any other, and no
// scrollback block model is needed — the response is a one-shot block, so it
// takes an allocated id (see `commit-frontier.js`).
const outputFrontier = createFrontier({ write: (chunk) => process.stdout.write(chunk) });


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

  // The whole box is assembled first and committed once, so the terminal sees
  // one finalized block instead of a stream of rows (and the lease, which
  // repaints the live prompt around every write, is charged once).
  let out = '';

  // Dim tool-count header — the only status line of the turn (replaces the
  // old "✓ N tools completed" footer). Consumes the counter.
  if (turnState.toolsRun > 0) {
    const label = turnState.toolsRun === 1 ? '1 tool' : `${turnState.toolsRun} tools`;
    out += GAP.section;
    // A count is meta punctuation: the dimmest step of the scale.
    out += `  ${ROLE.meta.punct(`↳ ${label}`)}\n`;
    turnState.toolsRun = 0;
  }

  // Leading blank line: exactly one gap between this box and the block above
  out += '\n';

  // Open box top — ANSI parts composed separately: the accent label's RESET
  // must never kill the muted color of the dashes after it
  out += `  ${ROLE.border.box('╭─')} ${C.bold(ROLE.agent('emile'))} ${ROLE.border.box('─'.repeat(Math.max(boxW - 10, 0)))}\n`;

  // Inner top padding — breathing room under the border
  out += '\n';

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
      out += `${BOX_INDENT}${line}\n`;
    }
  }

  // Inner bottom padding + open box bottom
  out += '\n';
  out += boxBottomOpen(boxW) + '\n';

  outputFrontier.commit(out);
}
