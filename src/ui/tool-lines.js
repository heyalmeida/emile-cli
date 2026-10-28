// tool-lines.js — ui/ module tree (extracted from the former src/ui.js monolith).
// See docs/architecture.md for the module map.
import { C, ROLE, GAP, MAX_BOX_W, BOX_INDENT, getW, stripAnsi, wrapText, fmtK, boxTopOpen, boxBottomOpen } from './theme.js';
import { config } from '../config.js';
import { turnState } from './turn-state.js';
import { getModelInfo } from '../models.js';
import readline from 'node:readline';
import { stripTerminalControls } from './control.js';
import { createFrontier } from './commit-frontier.js';

// A finished tool grid is FINAL: committed once (print-once, one write,
// synchronized on a TTY) rather than emitted row by row. `write` stays a thunk
// so the ADR-0003 stdout lease keeps arbitrating the write.
const outputFrontier = createFrontier({ write: (chunk) => process.stdout.write(chunk) });

// ──────────────────────────────────────────────
//  Tool Execution Summary
// ──────────────────────────────────────────────

export function formatToolSummary(toolCalls) {
  if (!toolCalls || toolCalls.length === 0) return null;

  const counts = {};
  const details = [];

  for (const tc of toolCalls) {
    const name = tc.function.name;
    counts[name] = (counts[name] || 0) + 1;

    let args = {};
    try { args = JSON.parse(tc.function.arguments); } catch { /* ignore */ }

    // Short lowercase labels for the grid-aligned tool lines (label column is
    // 8 chars). `tone` is a ROLE key (never a hue): it says WHY the row has a
    // color, so the palette can be retuned without re-deciding the taxonomy —
    // see ROLE.tool in theme.js and visual-identity § 3. MCP tools
    // (mcp__server__tool) render their last name segment.
    let label = name;
    let arg = '';
    let tone = 'workflow';

    if (name === 'readFile' && args.path) { label = 'read'; arg = args.path; tone = 'passive'; }
    else if (name === 'writeFile' && args.path) { label = 'write'; arg = args.path; tone = 'mutate'; }
    else if (name === 'editFile' && args.path) { label = 'edit'; arg = args.path; tone = 'mutate'; }
    else if (name === 'listDir') { label = 'list'; arg = args.path || '.'; tone = 'plain'; }
    else if (name === 'findFiles' && args.pattern) { label = 'find'; arg = args.pattern; tone = 'search'; }
    else if (name === 'grepSearch' && args.query) { label = 'grep'; arg = args.query; tone = 'search'; }
    else if (name === 'runCommand' && args.command) { label = 'exec'; arg = args.command.substring(0, 120); tone = 'danger'; }
    else if (name === 'proposeMemory') { label = 'memory'; arg = 'candidate'; tone = 'mutate'; }
    else if (name === 'recallMemory') { label = 'recall'; arg = 'global memory'; tone = 'passive'; }
    else if (name === 'searchWeb' && args.query) { label = 'web'; arg = stripTerminalControls(args.query); tone = 'search'; }
    else if (name === 'browsePage' && args.url) {
      label = 'browse';
      try { arg = new URL(args.url).hostname; } catch { arg = 'invalid URL'; }
      tone = 'passive';
    }
    else if (name === 'createPlan') { label = 'plan'; }
    else if (name === 'updateTask') { label = 'task'; }
    else if (name.includes('__')) {
      const separator = name.lastIndexOf('__');
      const server = name.slice(0, separator);
      const tool = name.slice(separator + 2);
      label = `[mcp:${server}]`;
      arg = tool;
      tone = 'passive';
    }

    details.push({
      label: stripTerminalControls(label),
      arg: stripTerminalControls(arg),
      tone,
      mcp: name.includes('__'),
    });
  }

  const total = toolCalls.length;
  const summary = Object.entries(counts)
    .map(([name, count]) => `${name}(${count})`)
    .join(', ');

  return { total, summary, details };
}

// Tools executed in the current turn — consumed by printAssistantResponse to
// render the `↳ N tools` dim header above the response box (display-only,
// reset on every new user message and after being consumed).

// ──────────────────────────────────────────────────────────────
//  Verb-grouping (P1-18 Stage B-1, audit idea 8)
// ──────────────────────────────────────────────────────────────
// A run of adjacent similar calls is ONE batch, not N events: reading 20 files
// printed 20 rows and hid the batch's shape. These roles are the informational
// ones — the argument is a place to LOOK. A side-effect row (mutate: write /
// edit / memory proposal; danger: shell) never groups, because there the
// argument IS the information (reference `scrollback/state/verb_group.rs:1-10`
// folds a run of consecutive non-destructive calls and keeps commands/edits
// label-only — `tool/mod.rs:94-104`).
const GROUPABLE_TONES = new Set(['passive', 'plain', 'search']);
/** A run this long is a batch; a shorter one stays a sequence. */
const GROUP_MIN = 3;
/** Distinct arguments listed inline before the `+N more` marker. */
const GROUP_ARGS_SHOWN = 3;

/** Two details belong to the same batch only if they ARE the same operation:
 *  same role tone, same label (an MCP row labels its server) and same MCP-ness. */
function sameBatch(a, b) {
  return a.tone === b.tone && a.label === b.label && a.mcp === b.mcp;
}

/**
 * Splits the details into render rows: `{ group: true, details }` for a batch of
 * GROUP_MIN+ adjacent groupable calls, `{ detail }` for everything else, in
 * original order. Pure, so the grouping rule is testable without stdout.
 */
export function groupRows(details = []) {
  const rows = [];
  for (let i = 0; i < details.length; i += 1) {
    const first = details[i];
    if (!GROUPABLE_TONES.has(first.tone)) {
      rows.push({ detail: first });
      continue;
    }
    let end = i + 1;
    while (end < details.length && sameBatch(details[end], first)) end += 1;
    const run = details.slice(i, end);
    if (run.length >= GROUP_MIN) rows.push({ group: true, details: run });
    else for (const detail of run) rows.push({ detail });
    i = end - 1;
  }
  return rows;
}

/**
 * Prints tool execution block — grid-aligned single lines (premium minimal):
 *
 *   ● read   src/index.ts
 *   ● edit   src/cli.js
 *   ● exec   npm test -- --runInBand
 *
 * No box: borders around tool calls add noise without information. The label
 * column is a fixed 8 chars so different tool types stay grid-aligned; bullet
 * and label carry the semantic tone of the operation; args are dim and
 * truncated to the terminal width.
 */
export function printToolSummary(toolCalls) {
  const info = formatToolSummary(toolCalls);
  if (!info) return;

  const cols = process.stdout.columns || 80;
  const LABEL_W = 8; // fixed label column — grid alignment
  // indent(2) + bullet(1) + space(1) + label(8) = 12 chars before the arg; the
  // width is derived from the prefix itself so single rows and batches share it.

  const prefixFor = (detail) => {
    // The tone is a role key; an unrecognised one falls back to the workflow
    // role, exactly as the previous hue lookup fell back to the accent.
    const tone = ROLE.tool[detail.tone] || ROLE.tool.workflow;
    if (detail.mcp) {
      const maxMcp = Math.max(cols - 6, 20);
      const mcpLabel = detail.label.length > maxMcp ? detail.label.slice(0, maxMcp - 1) + '…' : detail.label;
      return `  ${tone('●')} ${tone(mcpLabel)} `;
    }
    const label = (detail.label || '').substring(0, LABEL_W).padEnd(LABEL_W);
    return `  ${tone('●')} ${tone(label)} `;
  };
  const argWidthFor = (prefix) => Math.max(cols - 4 - stripAnsi(prefix).length, 10);

  const gridLines = [];
  const pushMultilineArg = (prefix, value, width) => {
    const cleanValue = stripTerminalControls(value);
    const lines = cleanValue.split('\n').map(line =>
      line.length > width ? line.substring(0, width - 1) + '…' : line
    );
    const continuationIndent = ' '.repeat(stripAnsi(prefix).length);
    const renderLine = line => line ? C.dim(line) : '';
    gridLines.push(`${prefix}${renderLine(lines[0] || '')}`);
    for (const line of lines.slice(1)) {
      gridLines.push(`${continuationIndent}${renderLine(line)}`);
    }
  };

  /**
   * One row for a batch: up to GROUP_ARGS_SHOWN distinct arguments, then an
   * explicit `+N more` (N = calls not represented). Arguments are dropped from
   * the list until the row fits, so the count survives truncation — it is the
   * part that says how much is hidden.
   */
  const pushGroupedRow = (prefix, run, width) => {
    const distinct = [];
    for (const detail of run) {
      const firstLine = stripTerminalControls(detail.arg || '').split('\n')[0];
      if (firstLine && !distinct.includes(firstLine)) distinct.push(firstLine);
    }
    let shown = distinct.slice(0, GROUP_ARGS_SHOWN);
    let text = '';
    for (;;) {
      const hidden = run.length - shown.length;
      text = shown.join(', ') + (hidden > 0 ? `${shown.length ? ', ' : ''}+${hidden} more` : '');
      if (shown.length === 0 || text.length <= width) break;
      shown = shown.slice(0, -1);
    }
    gridLines.push(`${prefix}${text ? C.dim(text) : ''}`);
  };

  for (const row of groupRows(info.details)) {
    if (row.group) {
      const prefix = prefixFor(row.details[0]);
      pushGroupedRow(prefix, row.details, argWidthFor(prefix));
      continue;
    }
    const prefix = prefixFor(row.detail);
    pushMultilineArg(prefix, row.detail.arg || '', argWidthFor(prefix));
  }

  // Feed the turn counter — consumed by printAssistantResponse (`↳ N tools`)
  turnState.toolsRun += info.total;

  // Leading blank line: exactly one gap between this group and the block above.
  // The frontier closes the last row, so every line keeps its own `\n`.
  outputFrontier.commit(`${GAP.section}${gridLines.join('\n')}`);
}

/**
 * Prints skill detection notice — minimal bullet, same indent as tools.
 */
export function printSkillsDetected(names) {
  if (!names || names.length === 0) return;
  console.log();
  for (const name of names) {
    process.stdout.write(`  ${C.muted('•')} ${C.dim(`skill: ${name}`)}\n`);
  }
}
