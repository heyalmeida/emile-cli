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

function getResponseGeometry() {
  const cols = process.stdout.columns || 80;
  const boxW = Math.min(cols - 4, MAX_BOX_W);
  return { boxW, wrapW: boxW - BOX_INDENT.length };
}

function formatResponseBody(content, wrapW) {
  const sanitized = sanitizeAssistantOutput(content).trimEnd();
  if (!sanitized.trim()) return [];

  const prewrapped = sanitized
    .split('\n')
    .flatMap(rawLine => {
      if (rawLine.trim() === '') return [''];
      if (rawLine.trimStart().startsWith('```')) return [rawLine];
      return wrapText(rawLine, wrapW);
    })
    .join('\n');

  const rendered = renderMarkdown(prewrapped);
  return rendered ? rendered.split('\n') : [];
}

function printToolCountHeader() {
  if (turnState.toolsRun <= 0) return;
  const label = turnState.toolsRun === 1 ? '1 tool' : `${turnState.toolsRun} tools`;
  process.stdout.write(GAP.section);
  process.stdout.write(`  ${C.dim(`↳ ${label}`)}\n`);
  turnState.toolsRun = 0;
}

let _responseStreamActive = false;
let _responseStreamContent = '';
let _responseStreamLines = 0;
let _responseStreamBoxWidth = 0;

/**
 * Starts the same response box used by the final renderer, but keeps it open
 * while content deltas arrive. Every update is emitted as one assembled frame
 * so the active-turn prompt can arbitrate stdout without leaving a partial
 * response on screen.
 */
export function startResponseStream() {
  if (_responseStreamActive) return;
  const { boxW } = getResponseGeometry();
  _responseStreamActive = true;
  _responseStreamContent = '';
  _responseStreamLines = 0;
  _responseStreamBoxWidth = boxW;

  printToolCountHeader();
  process.stdout.write(GAP.section);
  process.stdout.write(`  ${C.muted('╭─')} ${C.bold(C.accent('emile'))} ${C.muted('─'.repeat(Math.max(boxW - 10, 0)))}\n`);
  process.stdout.write('\n');
}

export function appendResponseStream(delta) {
  if (!delta) return;
  if (!_responseStreamActive) startResponseStream();
  _responseStreamContent += delta;

  const { wrapW } = getResponseGeometry();
  const lines = formatResponseBody(_responseStreamContent, wrapW);
  const oldLineCount = _responseStreamLines;
  let output = '';

  if (oldLineCount > 0) output += `\x1B[${oldLineCount}A`;
  for (const line of lines) output += `\r\x1B[K${BOX_INDENT}${line}\n`;

  if (lines.length < oldLineCount) {
    for (let i = 0; i < oldLineCount - lines.length; i++) output += '\r\x1B[K\n';
    output += `\x1B[${oldLineCount - lines.length}A`;
  }

  _responseStreamLines = lines.length;
  if (output) process.stdout.write(output);
}

export function endResponseStream() {
  if (!_responseStreamActive) return;
  _responseStreamActive = false;
  if (_responseStreamLines > 0) {
    process.stdout.write(`\n${boxBottomOpen(_responseStreamBoxWidth)}\n`);
  }
  _responseStreamContent = '';
  _responseStreamLines = 0;
  _responseStreamBoxWidth = 0;
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

  const { boxW, wrapW } = getResponseGeometry();
  printToolCountHeader();

  // Leading blank line: exactly one gap between this box and the block above
  console.log();

  // Open box top — ANSI parts composed separately: the accent label's RESET
  // must never kill the muted color of the dashes after it
  process.stdout.write(`  ${C.muted('╭─')} ${C.bold(C.accent('emile'))} ${C.muted('─'.repeat(Math.max(boxW - 10, 0)))}\n`);

  // Inner top padding — breathing room under the border
  console.log();

  for (const line of formatResponseBody(sanitized, wrapW)) {
    process.stdout.write(`${BOX_INDENT}${line}\n`);
  }

  // Inner bottom padding + open box bottom
  console.log();
  process.stdout.write(boxBottomOpen(boxW) + '\n');
}
