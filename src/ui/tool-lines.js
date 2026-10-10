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
  // indent(2) + bullet(1) + space(1) + label(8) = 12 chars before the arg
  const maxArg = Math.max(cols - 4 - 2 - LABEL_W - 1, 10);

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

  for (const d of info.details) {
    // The tone is a role key; an unrecognised one falls back to the workflow
    // role, exactly as the previous hue lookup fell back to the accent.
    const tone = ROLE.tool[d.tone] || ROLE.tool.workflow;
    if (d.mcp) {
      const maxMcp = Math.max(cols - 6, 20);
      const mcpLabel = d.label.length > maxMcp ? d.label.slice(0, maxMcp - 1) + '…' : d.label;
      const prefix = `  ${tone('●')} ${tone(mcpLabel)} `;
      pushMultilineArg(prefix, d.arg, Math.max(cols - 4 - stripAnsi(prefix).length, 10));
      continue;
    }
    const label = (d.label || '').substring(0, LABEL_W).padEnd(LABEL_W);
    const prefix = `  ${tone('●')} ${tone(label)} `;
    pushMultilineArg(prefix, d.arg || '', maxArg);
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
