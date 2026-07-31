import pc from 'picocolors';
import readline from 'readline';
import { config } from './config.js';

// ──────────────────────────────────────────────────────────────
//  Tokyo Night Color Palette
//  Primary:   #7AA2F7 → pc.blue (closest)
//  Accent:    #BB9AF7 → pc.magenta
//  Muted:     #565F89 → pc.gray
//  Success:   #9ECE6A → pc.green
//  Warning:   #E0AF68 → pc.yellow
//  Error:     #F7768E → pc.red
//  Cyan:      #7DCFFF → pc.cyan
// ──────────────────────────────────────────────────────────────

// True-color helpers (fallback to picocolors when not supported)
const ESC = '\x1B';
function rgb(r, g, b) { return `${ESC}[38;2;${r};${g};${b}m`; }
function bgRgb(r, g, b) { return `${ESC}[48;2;${r};${g};${b}m`; }
const RESET = `${ESC}[0m`;

// Palette — exported so other modules (cli.js, commands.js) can reuse the
// exact same Tokyo Night colors instead of picocolors' different ANSI shades.
export const C = {
  accent:  (s) => `${rgb(122,162,247)}${s}${RESET}`,   // #7AA2F7 blue accent
  purple:  (s) => `${rgb(187,154,247)}${s}${RESET}`,   // #BB9AF7 purple
  muted:   (s) => `${rgb(86,95,137)}${s}${RESET}`,     // #565F89 muted gray
  success: (s) => `${rgb(158,206,106)}${s}${RESET}`,   // #9ECE6A green
  warn:    (s) => `${rgb(224,175,104)}${s}${RESET}`,   // #E0AF68 amber
  info:    (s) => `${rgb(125,207,255)}${s}${RESET}`,   // #7DCFFF cyan
  red:     (s) => `${rgb(247,118,142)}${s}${RESET}`,   // #F7768E red
  fg:      (s) => `${rgb(169,177,214)}${s}${RESET}`,   // #A9B1D6 foreground
  dim:     (s) => `${ESC}[2m${s}${RESET}`,
  bold:    (s) => `${ESC}[1m${s}${RESET}`,
};

// ──────────────────────────────────────────────────────────────
//  Width
// ──────────────────────────────────────────────────────────────

export function getW() {
  const cols = process.stdout.columns || 80;
  return Math.max(cols - 4, 60);
}

// ──────────────────────────────────────────────
//  ANSI Helpers
// ──────────────────────────────────────────────

function stripAnsi(str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*m|\x1B\[38;2;\d+;\d+;\d+m|\x1B\[48;2;\d+;\d+;\d+m/g, '');
}

function padRight(str, width) {
  const visible = stripAnsi(str).length;
  const diff = width - visible;
  return diff > 0 ? str + ' '.repeat(diff) : str;
}

function wrapText(text, width) {
  if (text.length <= width) return [text];
  const lines = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= width) {
      lines.push(remaining);
      break;
    }
    let splitIdx = remaining.lastIndexOf(' ', width);
    if (splitIdx === -1 || splitIdx === 0) {
      splitIdx = width;
    }
    lines.push(remaining.substring(0, splitIdx).trim());
    remaining = remaining.substring(splitIdx).trim();
  }
  return lines;
}

// Format a token count with a `k` suffix (128000 → 128k, 14200 → 14.2k)
function fmtK(n) {
  if (n >= 1000) {
    const k = n / 1000;
    return Number.isInteger(k) ? `${k}k` : `${k.toFixed(1)}k`;
  }
  return String(n);
}

// ──────────────────────────────────────────────
//  Box Drawing Helpers (UTF-8 rounded corners)
// ──────────────────────────────────────────────

function boxTop(label = '', innerW) {
  if (label) {
    const labelStr = `─ ${label} `;
    const fill = Math.max(innerW - labelStr.length, 0);
    return C.muted(`  ╭${labelStr}${'─'.repeat(fill)}╮`);
  }
  return C.muted(`  ╭${'─'.repeat(innerW)}╮`);
}

function boxRow(content, innerW) {
  return C.muted('  │') + padRight(` ${content}`, innerW - 1) + C.muted(' │');
}

function boxBottom(innerW) {
  return C.muted(`  ╰${'─'.repeat(innerW)}╯`);
}

// ──────────────────────────────────────────────
//  Sanitizer & Text Interceptor
// ──────────────────────────────────────────────

/**
 * Sanitizes assistant output:
 * 1. Decodes Unicode escape sequences like \u00e3o -> ão
 * 2. Un-escapes double-escaped newlines (\n) and tabs (\t)
 * 3. Strips XML tool call tags like <TOOLCALL>...</TOOLCALL>, <tool_call>...</tool_call>
 * 4. Strips standalone JSON code blocks containing tool calls
 */
export function sanitizeAssistantOutput(text) {
  if (!text || typeof text !== 'string') return '';

  let sanitized = text;

  // 1. Decode Unicode escape sequences (\uXXXX)
  sanitized = sanitized.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => {
    try {
      return String.fromCharCode(parseInt(hex, 16));
    } catch {
      return _;
    }
  });

  // 2. Decode double-escaped newlines and tabs
  sanitized = sanitized.replace(/\\n/g, '\n').replace(/\\t/g, '\t');

  // 3. Strip XML/HTML tool call tags
  sanitized = sanitized.replace(/<TOOLCALL>[\s\S]*?<\/TOOLCALL>/gi, '');
  sanitized = sanitized.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '');
  sanitized = sanitized.replace(/<tool>[\s\S]*?<\/tool>/gi, '');
  sanitized = sanitized.replace(/<function_calls>[\s\S]*?<\/function_calls>/gi, '');

  // 4. Strip raw JSON blocks containing tool calls if model outputs standalone JSON
  sanitized = sanitized.replace(/```json\s*\{\s*"name"\s*:\s*"[^"]+"[\s\S]*?\}\s*```/gi, '');

  return sanitized;
}

// ──────────────────────────────────────────────
//  Custom Markdown Renderer
// ──────────────────────────────────────────────

export function renderMarkdown(text) {
  if (!text || text.trim().length === 0) return '';
  const cleanText = sanitizeAssistantOutput(text);

  const lines = cleanText.split('\n');
  const result = [];
  let inCodeBlock = false;
  let codeLang = '';

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Code block fences
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      if (inCodeBlock) {
        codeLang = line.trim().substring(3).trim();
        result.push(C.muted('  │ ') + C.dim(codeLang ? `── ${codeLang} ──` : '────────'));
      } else {
        result.push(C.muted('  │ ') + C.dim('────────'));
        codeLang = '';
      }
      continue;
    }

    // Inside code block — dim content with left bar
    if (inCodeBlock) {
      result.push(C.muted('  │ ') + C.dim(line));
      continue;
    }

    // Headers
    if (line.startsWith('### ')) {
      result.push(C.bold(C.fg(line.substring(4))));
      continue;
    }
    if (line.startsWith('## ')) {
      result.push(C.bold(C.accent(line.substring(3))));
      continue;
    }
    if (line.startsWith('# ')) {
      result.push(C.bold(C.accent(line.substring(2))));
      continue;
    }

    // Inline formatting
    line = line.replace(/\*\*(.+?)\*\*/g, (_, b) => C.bold(b));
    line = line.replace(/__(.+?)__/g, (_, b) => C.bold(b));
    line = line.replace(/`([^`]+)`/g, (_, c) => C.info(c));

    // Italic (*text* or _text_) — skip bold already handled
    line = line.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, (_, t) => C.dim(t));
    line = line.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, (_, t) => C.dim(t));

    // List items: `* ` or `- ` at start of line
    if (/^[*\-] /.test(line)) {
      line = C.muted('  ·') + ' ' + line.substring(2);
    }

    // Numbered list items
    if (/^\d+\. /.test(line)) {
      const match = line.match(/^(\d+)\. (.*)$/);
      if (match) {
        line = C.muted(`  ${match[1]}.`) + ' ' + match[2];
      }
    }

    // Blockquotes
    if (line.startsWith('> ')) {
      line = C.muted('  │ ') + C.dim(line.substring(2));
    }

    result.push(line);
  }

  return result.join('\n');
}

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

    // Claude-Code-style label + arg split (label is capitalized + bold when
    // rendered). MCP tools (and any unknown tool) keep their full name.
    let label = name;
    let arg = '';

    if (name === 'readFile' && args.path) { label = 'Read'; arg = args.path; }
    else if (name === 'writeFile' && args.path) { label = 'Write'; arg = args.path; }
    else if (name === 'editFile' && args.path) { label = 'Edit'; arg = args.path; }
    else if (name === 'listDir') { label = 'List'; arg = args.path || '.'; }
    else if (name === 'findFiles' && args.pattern) { label = 'Find'; arg = args.pattern; }
    else if (name === 'grepSearch' && args.query) { label = 'Grep'; arg = args.query; }
    else if (name === 'runCommand' && args.command) { label = 'Exec'; arg = args.command.substring(0, 60); }
    else if (name === 'createPlan') { label = 'Create plan'; }
    else if (name === 'updateTask') { label = 'Update task'; }

    details.push({ label, arg });
  }

  const total = toolCalls.length;
  const summary = Object.entries(counts)
    .map(([name, count]) => `${name}(${count})`)
    .join(', ');

  return { total, summary, details };
}

// ──────────────────────────────────────────────────────────────
//  ZONA 1: Header — Banner + Session Info
// ──────────────────────────────────────────────────────────────

export function printHeader(version = '1.0.0') {
  const w = getW();
  const cols = process.stdout.columns || 80;

  console.log();
  // Top border
  process.stdout.write(C.muted('  ╭' + '─'.repeat(w) + '╮') + '\n');

  // Brand row
  const brand = C.bold(C.accent('✦  emile')) + '  ' + C.muted(`v${version}`);
  const tagline = C.muted('Developer coding agent');
  const brandVisible = stripAnsi(brand).length + 2; // +2 for '  '
  const taglineVisible = stripAnsi(tagline).length;
  const gap = Math.max(w - brandVisible - taglineVisible, 1);

  process.stdout.write(C.muted('  │') + ' ' + brand + ' '.repeat(gap) + tagline + ' ' + C.muted('│') + '\n');

  // Bottom border
  process.stdout.write(C.muted('  ╰' + '─'.repeat(w) + '╯') + '\n');
  console.log();
}

export function printStartupScreen(version = '1.0.0') {
  const w = getW();
  console.log();
  process.stdout.write(C.muted('  ╭' + '─'.repeat(w) + '╮') + '\n');

  const brand = C.bold(C.accent('✦  emile')) + '  ' + C.muted(`v${version}`);
  const tagline = C.muted('Developer coding agent');
  const brandVisible = stripAnsi(brand).length + 2;
  const taglineVisible = stripAnsi(tagline).length;
  const gap = Math.max(w - brandVisible - taglineVisible, 1);

  process.stdout.write(C.muted('  │') + ' ' + brand + ' '.repeat(gap) + tagline + ' ' + C.muted('│') + '\n');
  process.stdout.write(C.muted('  ╰' + '─'.repeat(w) + '╯') + '\n');
  console.log();
}

/**
 * Renders a bordered, column-aligned configuration card:
 * ┌─ Session & Model Configuration ────────────────────────┐
 * │ provider    openrouter                                  │
 * │ model       free (low)                                  │
 * │ cache       on             safe-gate    off             │
 * └─────────────────────────────────────────────────────────┘
 */
export function printConfigBox({ provider, model, cache, effort, plans, dryRun, safeMode }) {
  const shortModel = model.split('/').pop();
  const cols = process.stdout.columns || 80;
  const boxW = Math.min(cols - 4, 62); // inner content width
  const innerW = boxW - 2;             // subtract the two side │ chars

  const KEY_W = 12; // fixed key column width for alignment

  // Helper: renders one key=value cell, left-padded to keyW, value styled
  function cell(key, val) {
    return C.muted(key.padEnd(KEY_W)) + val;
  }

  // Row builder: fills the box row accounting for ANSI
  function row(content) {
    const vis = stripAnsi(content).length;
    const pad = Math.max(innerW - vis - 1, 0);
    return C.muted('  │') + ' ' + content + ' '.repeat(pad) + C.muted(' │');
  }

  const topLabel = '─ Configuration ';
  const topFill = Math.max(boxW - topLabel.length, 0);
  process.stdout.write(C.muted(`  ┌${topLabel}${'─'.repeat(topFill)}┐`) + '\n');

  // provider
  process.stdout.write(row(cell('provider', C.bold(C.fg(provider)))) + '\n');

  // model
  const modelVal = C.bold(C.accent(shortModel)) + (effort ? C.muted(` (${effort})`) : '');
  process.stdout.write(row(cell('model', modelVal)) + '\n');

  // cache + safe-gate on same row (two-column layout)
  const cacheVal  = cache    ? C.success('on')  : C.red('off');
  const safeVal   = safeMode ? C.success('on')  : C.red('off');
  const leftCell  = cell('cache', cacheVal);
  const rightCell = C.muted('safe-gate'.padEnd(KEY_W)) + safeVal;
  const leftVis   = stripAnsi(leftCell).length;
  const colGap    = Math.max(innerW - leftVis - stripAnsi(rightCell).length - 1, 2);
  process.stdout.write(row(leftCell + ' '.repeat(colGap) + rightCell) + '\n');

  // optional mode rows
  if (plans)  process.stdout.write(row(cell('mode', C.warn('plans')))   + '\n');
  if (dryRun) process.stdout.write(row(cell('mode', C.red('dry-run')))  + '\n');

  process.stdout.write(C.muted(`  └${'─'.repeat(boxW)}┘`) + '\n');
  console.log();
}

// Keep old name as alias for backward compat (used by /connect refresh etc.)
export const printConfig = printConfigBox;

// ──────────────────────────────────────────────────────────────
//  ZONA 3: Single Persistent Status Bar (footer)
// ──────────────────────────────────────────────────────────────

export function printSessionBar({ sessionId, model, messageCount, stats, mcpInfo }) {
  const shortId = sessionId.substring(0, 12);
  const shortModel = model.split('/').pop();
  const cols = process.stdout.columns || 80;

  // Context usage as a model quota: tokens: 14.2k / 128k (11%)
  // Prefer the authoritative prompt_tokens from the latest API response;
  // fall back to the char-based pre-call estimate when no response yet.
  const limit = (stats && stats.contextLimit) || 128000;
  const contextTokens =
    (stats && stats.lastPromptTokens) ||
    (stats && stats.estimatedContextTokens) ||
    0;
  let tokenStr = '';
  if (contextTokens > 0) {
    const pct = Math.round((contextTokens / limit) * 100);
    tokenStr = `tokens: ${fmtK(contextTokens)} / ${fmtK(limit)} (${pct}%)`;
  }

  // Build segments: session | model | msgs | tokens | MCP
  const sep = C.muted(' │ ');

  const segments = [
    C.muted(shortId),
    C.accent(shortModel),
    C.muted(`msgs: ${C.bold(C.fg(String(messageCount)))}`),
  ];

  if (tokenStr) segments.push(C.muted(tokenStr));
  if (mcpInfo)  segments.push(C.info(`MCP: ${mcpInfo}`));

  const bar = segments.join(sep);
  const lineW = Math.max(cols - 4, 20);

  console.log();
  // Status bar line with separator above
  process.stdout.write(C.muted('  ' + '─'.repeat(lineW)) + '\n');
  process.stdout.write('  ' + bar + '\n');
}

// ──────────────────────────────────────────────────────────────
//  ZONA 2: Chat Canvas Components
// ──────────────────────────────────────────────────────────────

/**
 * Prints a styled user message block.
 * ❯ <prompt>
 */
export function printUserMessage(text) {
  // Breathing room: a blank line before AND after so the user's message is
  // clearly separated from the status bar above and the assistant's reply below.
  console.log();
  console.log(`  ${C.accent('❯')} ${C.bold(C.fg(text))}`);
  console.log();
}

/**
 * Prints the AI response inside a box with proper word-wrap.
 * Text is wrapped to innerWidth BEFORE markdown rendering so it
 * never bleeds past the right border │.
 *
 * ╭─ emile ────────────────────────────────────────────────────╮
 * │ Text wrapped perfectly respecting the inner width.         │
 * ╰────────────────────────────────────────────────────────────╯
 */
export function printAssistantResponse(content) {
  const sanitized = sanitizeAssistantOutput(content).trim();
  if (!sanitized) return;

  const cols  = process.stdout.columns || 80;
  // innerW: space between the two │ chars, minus 1 leading space
  const boxW  = Math.min(cols - 4, 120); // total box width (border to border)
  const innerW = boxW - 2;               // usable text columns inside the box
  const wrapW  = innerW - 2;             // -2 for the ` ` left pad + trailing space

  const label = '─ emile ';
  const topFill = Math.max(boxW - label.length, 0);

  console.log();
  process.stdout.write(C.muted(`  ╭${label}${'─'.repeat(topFill)}╮`) + '\n');

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
      const visLen = stripAnsi(line).length;
      const padding = Math.max(innerW - visLen - 1, 0);
      process.stdout.write(C.muted('  │') + ` ${line}${' '.repeat(padding)}` + C.muted(' │') + '\n');
    }
  }

  process.stdout.write(C.muted(`  ╰${'─'.repeat(boxW)}╯`) + '\n');
}

/**
 * Live thinking stream — renders reasoning deltas in real time as they arrive
 * from the API (Claude-Code-style flowing dim text). The block is redrawn on
 * every delta with proper word-wrap + indentation so long lines stay readable.
 *
 * Lifecycle (called from agent.js during the SSE stream):
 *   startThinkingStream()      → emit header, begin the block
 *   appendThinkingStream(delta) → append + redraw wrapped dim text
 *   endThinkingStream()        → finalize (leaves rendered text in place)
 */
let _thinkingStreamActive = false;
let _thinkingBuffer = '';
let _thinkingLinesPrinted = 0;
let _thinkingHeaderPrinted = false;

export function startThinkingStream() {
  if (_thinkingStreamActive) return;
  _thinkingStreamActive = true;
  _thinkingBuffer = '';
  _thinkingLinesPrinted = 0;
  _thinkingHeaderPrinted = false;
  // Compact header: ✻ Thinking… (no blank line before — tight like Claude Code)
  process.stdout.write(`  ${C.muted('✻')} ${C.dim('Thinking…')}\n`);
  _thinkingHeaderPrinted = true;
}

export function appendThinkingStream(delta) {
  if (!delta) return;
  if (!_thinkingStreamActive) startThinkingStream();
  _thinkingBuffer += delta;

  const cols = process.stdout.columns || 80;
  const innerW = Math.max(cols - 4, 40);

  // Build new wrapped dim lines
  const newLines = [];
  for (const rawLine of _thinkingBuffer.split('\n')) {
    if (rawLine.trim().length === 0) { newLines.push(''); continue; }
    for (const w of wrapText(rawLine, innerW)) newLines.push(w);
  }

  const oldTotal = (_thinkingHeaderPrinted ? 1 : 0) + _thinkingLinesPrinted;
  const newTotal = (_thinkingHeaderPrinted ? 1 : 0) + newLines.length;

  // Move cursor up to the start of the thinking block (header + old dim lines)
  if (oldTotal > 0) {
    process.stdout.write(`\x1B[${oldTotal}A`);
  }

  // Re-render header
  if (_thinkingHeaderPrinted) {
    process.stdout.write('\r\x1B[K' + `  ${C.muted('✻')} ${C.dim('Thinking…')}\n`);
  }

  // Re-render dim lines, each with line-erase prefix
  for (const line of newLines) {
    process.stdout.write('\r\x1B[K' + '  ' + C.dim(line) + '\n');
  }

  // If new content has fewer lines, clear the leftover lines
  if (newTotal < oldTotal) {
    for (let i = 0; i < oldTotal - newTotal; i++) {
      process.stdout.write('\r\x1B[K\n');
    }
    // Move cursor back up so position is consistent
    process.stdout.write(`\x1B[${oldTotal - newTotal}A`);
  }

  _thinkingLinesPrinted = newLines.length;
}

export function endThinkingStream() {
  if (!_thinkingStreamActive) return;
  _thinkingStreamActive = false;

  // If the user has thinking collapsed (/thinking toggle), erase the streamed
  // dim text and print a compact one-liner instead, matching printThinking's
  // compact mode. When expanded, the dim text stays visible as-is.
  if (config.expandThinking === false) {
    // Erase the whole thinking block (header + dim lines)
    const totalLines = (_thinkingHeaderPrinted ? 1 : 0) + _thinkingLinesPrinted;
    if (totalLines > 0) {
      process.stdout.write(`\x1B[${totalLines}A`);
      for (let i = 0; i < totalLines; i++) {
        process.stdout.write('\r\x1B[K\n');
      }
      process.stdout.write(`\x1B[${totalLines}A`);
    }
    // Print compact summary
    const wordCount = _thinkingBuffer.trim().split(/\s+/).length;
    const secs = Math.max(1, Math.round(wordCount / 50));
    const durationStr = secs === 1 ? '1s' : `${secs}s`;
    const lineCount = _thinkingBuffer.trim().split(/\r?\n/).filter(l => l.trim().length > 0).length;
    const lineCountStr = lineCount === 1 ? '1 line' : `${lineCount} lines`;
    if (wordCount > 0) {
      process.stdout.write(
        `  ${C.muted('✻')} ${C.warn(`Thought for ${durationStr}`)} ${C.muted(`(${lineCountStr} compressed)`)}\n`
      );
    }
  } else {
    // Expanded: leave the dim text visible, just a trailing blank line
    if (_thinkingLinesPrinted > 0) {
      console.log();
    }
  }

  _thinkingHeaderPrinted = false;
}

/**
 * Prints thinking/reasoning block — compact by default.
 *
 * Compact (default):  ▸ Thought for 3s  (4 lines)
 * Verbose (/thinking toggle):  shows full tree with all lines
 *
 * No Ctrl+P hint — /thinking command controls the mode.
 */
export function printThinking(content) {
  const cleanContent = sanitizeAssistantOutput(content);
  if (!cleanContent || cleanContent.trim().length === 0) return;

  // Expanded by default (so reasoning is visible). The /thinking toggle
  // collapses to a one-line summary instead.
  const isVerbose = config.expandThinking !== false;
  const innerWidth = Math.max((process.stdout.columns || 80) - 10, 40);

  const allLines = cleanContent.trim().split(/\r?\n/).filter(l => l.trim().length > 0);
  const lineCount = allLines.length;

  // Word-count heuristic for duration estimate
  const wordCount = cleanContent.trim().split(/\s+/).length;
  const secs = Math.max(1, Math.round(wordCount / 50));
  const durationStr = secs === 1 ? '1s' : `${secs}s`;
  const lineCountStr = lineCount === 1 ? '1 line' : `${lineCount} lines`;

  console.log();

  if (!isVerbose) {
    // Compact: single summary line, no extra visual noise
    process.stdout.write(
      `  ${C.muted('✻')} ${C.warn(`Thought for ${durationStr}`)} ${C.muted(`(${lineCountStr} compressed)`)}\n`
    );
    return;
  }

  // Verbose: header + full content (no truncation — every line is wrapped)
  process.stdout.write(`  ${C.warn('✻')} ${C.bold(C.warn(`Thought for ${durationStr}`))}\n`);

  for (const rawLine of allLines) {
    for (const wrapped of wrapText(rawLine, innerWidth)) {
      if (wrapped.trim().length > 0) {
        process.stdout.write(`    ${C.dim(wrapped)}\n`);
      }
    }
  }
}

/**
 * Prints tool execution block — Claude-Code-style minimal lines:
 *   ⏺ Read  src/index.ts
 *   ⏺ Edit  src/cli.js
 */
export function printToolSummary(toolCalls) {
  const info = formatToolSummary(toolCalls);
  if (!info) return;

  console.log();
  for (const d of info.details) {
    const label = C.bold(C.accent(d.label));
    const argStr = d.arg ? '  ' + C.dim(d.arg) : '';
    process.stdout.write(`  ${C.accent('⏺')} ${label}${argStr}\n`);
  }
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

/**
 * Prints completion checkmark after tools run.
 */
export function printToolsDone(count) {
  process.stdout.write(`  ${C.success('✔')} ${C.dim(`${count} tool${count > 1 ? 's' : ''} completed`)}\n`);
}

// ──────────────────────────────────────────────
//  Help Box
// ──────────────────────────────────────────────

export function printHelp() {
  const innerW = Math.min(getW() - 2, 56);

  const cmds = [
    ['/connect',  'Configure API provider and key'],
    ['/model',    'Select the active AI model'],
    ['/switch',   'Switch to a previous session'],
    ['/new',      'Start a new clean session'],
    ['/rewind',   'Rewind & edit your last message'],
    ['/undo',     'Revert the last file modification'],
    ['/cost',     'Show token usage and costs'],
    ['/export',   'Export session as Markdown'],
    ['/thinking', 'Toggle reasoning visibility'],
    ['/help',     'Display this help menu'],
    ['exit',      'Quit the CLI'],
  ];

  console.log();
  const topLabel = '─ Commands ';
  process.stdout.write(C.muted(`  ╭${topLabel}${'─'.repeat(Math.max(innerW - topLabel.length, 0))}╮`) + '\n');

  for (const [cmd, desc] of cmds) {
    const line = `${C.bold(C.accent(cmd.padEnd(13)))} ${C.muted(desc)}`;
    process.stdout.write(C.muted('  │ ') + padRight(line, innerW - 2) + C.muted(' │') + '\n');
  }

  process.stdout.write(C.muted(`  ╰${'─'.repeat(innerW)}╯`) + '\n');
  console.log();
}

// ──────────────────────────────────────────────
//  Diff Block
// ──────────────────────────────────────────────

export function printDiffBlock(filePath, changes) {
  const cols   = process.stdout.columns || 80;
  // Box must fit on screen; content area = boxW minus left prefix (8 chars: '  │ NNNN │ ')
  const boxW   = Math.max(cols - 4, 40);
  const PREFIX = 10; // '  │' + ' NNNN ' + '│' + ' ' = 10 visible chars
  const textW  = boxW - PREFIX - 3; // -3 for ' │' right border + gap

  const fileLabel = ` ${filePath} `;
  const topFill = Math.max(boxW - fileLabel.length - 2, 0);

  // Helper: pad a content string to fill the row, then close with right border │
  function diffRow(numStr, marker, styledLine, rawLine) {
    // rawLine used for visible-width calculation
    const rawVis = stripAnsi(rawLine).length;
    // truncate if overflows
    const truncated = rawVis > textW ? rawLine.substring(0, textW - 1) + '…' : styledLine;
    const visLen    = stripAnsi(truncated).length;
    const pad       = Math.max(textW - visLen, 0);
    return `  ${C.muted('│')} ${numStr} ${C.muted('│')} ${truncated}${' '.repeat(pad)} ${C.muted('│')}`;
  }

  console.log();
  process.stdout.write(C.muted('  ┌─') + C.bold(C.fg(fileLabel)) + C.muted('─'.repeat(topFill) + '┐') + '\n');

  let lineNum = 1;

  changes.forEach(part => {
    const lines = part.value.split('\n');
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();

    if (part.removed) {
      lines.forEach(line => {
        const num = C.red(String(lineNum).padStart(4));
        process.stdout.write(diffRow(num, '-', C.red(line), line) + '\n');
        lineNum++;
      });
    } else if (part.added) {
      lines.forEach(line => {
        const num = C.success(String(lineNum).padStart(4));
        process.stdout.write(diffRow(num, '+', C.success(line), line) + '\n');
        lineNum++;
      });
    } else {
      if (lines.length > 4) {
        for (let i = 0; i < 2; i++) {
          const num = C.muted(String(lineNum).padStart(4));
          process.stdout.write(diffRow(num, ' ', C.muted(lines[i]), lines[i]) + '\n');
          lineNum++;
        }
        const skipped = lines.length - 4;
        const skipMsg = `... ${skipped} lines ...`;
        const skipPad = Math.max(textW - skipMsg.length, 0);
        process.stdout.write(`  ${C.muted('│')}       ${C.muted('│')} ${C.dim(skipMsg)}${' '.repeat(skipPad)} ${C.muted('│')}\n`);
        lineNum += skipped;
        for (let i = lines.length - 2; i < lines.length; i++) {
          const num = C.muted(String(lineNum).padStart(4));
          process.stdout.write(diffRow(num, ' ', C.muted(lines[i]), lines[i]) + '\n');
          lineNum++;
        }
      } else {
        lines.forEach(line => {
          const num = C.muted(String(lineNum).padStart(4));
          process.stdout.write(diffRow(num, ' ', C.muted(line), line) + '\n');
          lineNum++;
        });
      }
    }
  });

  process.stdout.write(C.muted(`  └${'─'.repeat(boxW)}┘`) + '\n');
}

// ──────────────────────────────────────────────
//  Conversation History Replay
// ──────────────────────────────────────────────

export function printConversationHistory(messages, { summary = '' } = {}) {
  if (!messages || messages.length === 0) return;

  const cols = process.stdout.columns || 80;
  const lineW = Math.max(cols - 4, 20);

  // Count displayable messages (everything except the system prompt)
  const displayable = messages.filter(m => m.role !== 'system');

  // Restoration banner
  const title = summary ? `"${summary}"` : 'session';
  const bannerCore = ` 📜 Restored Session: ${title} (${displayable.length} messages loaded) `;
  const bannerFill = Math.max(lineW - stripAnsi(bannerCore).length, 0);
  console.log();
  process.stdout.write(C.muted(`  ───${bannerCore}${'─'.repeat(bannerFill)}`) + '\n');

  // Replay every message with the same native UI components used live.
  // No truncation — full content with Markdown rendering and tool summaries.
  for (const msg of messages) {
    if (msg.role === 'system') continue;

    if (msg.role === 'user') {
      printUserMessage(msg.content);
      continue;
    }

    if (msg.role === 'assistant') {
      if (msg.reasoning_content) printThinking(msg.reasoning_content);
      if (msg.content) printAssistantResponse(msg.content);
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        printToolSummary(msg.tool_calls);
        printToolsDone(msg.tool_calls.length);
      }
      continue;
    }

    // role: 'tool' — result messages are already represented by the preceding
    // assistant's tool_calls summary; skip raw results to keep the replay
    // faithful to the live experience and free of noise.
  }

  process.stdout.write(C.muted(`  ${'─'.repeat(lineW)}`) + '\n');
  console.log(C.dim('  End of history. Continue below.'));
  console.log();
}

// ──────────────────────────────────────────────
//  Interactive Prompt Input (ZONA 2/3 boundary)
// ──────────────────────────────────────────────

export function promptInput({ message = '❯', placeholder = '', initial = '', stats = null, sessionId = '', mcpInfo = null } = {}) {
  return new Promise((resolve) => {
    if (typeof process.stdin.setRawMode !== 'function') {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question(`${message} `, (answer) => {
        rl.close();
        resolve(answer);
      });
      return;
    }

    const isRaw = process.stdin.isRaw;
    process.stdin.setRawMode(true);
    process.stdin.resume();
    readline.emitKeypressEvents(process.stdin);

    let input = initial;
    let cursor = input.length;
    let selectedIndex = 0;

    const commands = [
      { name: '/connect', desc: 'Configure API provider and key' },
      { name: '/model', desc: 'Select the active AI model' },
      { name: '/switch', desc: 'Switch to a previous session' },
      { name: '/sessions', desc: 'List and switch previous sessions' },
      { name: '/new', desc: 'Start a new clean session' },
      { name: '/clear', desc: 'Clear the current conversation session' },
      { name: '/rewind', desc: 'Rewind & edit your last message' },
      { name: '/undo', desc: 'Revert the last file modification' },
      { name: '/cost', desc: 'Show session token usage and costs' },
      { name: '/export', desc: 'Export the current session as Markdown' },
      { name: '/thinking', desc: 'Toggle expanding/collapsing reasoning output' },
      { name: '/help', desc: 'Display this help menu' },
      { name: 'exit', desc: 'Quit the CLI' }
    ];

    function getMatches() {
      if (!input.startsWith('/')) {
        const exitMatch = 'exit'.startsWith(input.toLowerCase()) && input.length > 0;
        if (!exitMatch) return [];
      }
      return commands.filter(cmd => cmd.name.startsWith(input));
    }

    let lastRenderedHeight = 0;
    let lastInputLinesCount = 1;
    let lastCursorLine = 0;

    function render() {
      const columns = process.stdout.columns || 80;
      const promptStr = `${message} `;
      const promptLength = stripAnsi(promptStr).length;
      const lineW = Math.max(columns - 4, 10);

      // Count actual input lines (honoring explicit newlines for /rewind prefills)
      const inputParts = input.split('\n');
      const wrappedLines = inputParts.reduce((acc, part) => {
        if (part.length === 0) { acc.push(''); return acc; }
        return acc.concat(wrapText(part, Math.max(columns - promptLength, 10)));
      }, []);
      const currentInputLinesCount = Math.max(wrappedLines.length, 1);

      // Which wrapped line the cursor sits on (0-indexed). For single-line
      // input this is 0; for multi-line we walk the parts counting chars.
      let absCursorLine = 0;
      {
        let remaining = cursor;
        for (const part of inputParts) {
          const partW = part.length === 0 ? 1 : wrapText(part, Math.max(columns - promptLength, 10)).length;
          if (remaining <= part.length) break;
          remaining -= part.length + 1; // +1 for the '\n' between parts
          absCursorLine += partW;
        }
      }
      absCursorLine = Math.max(0, Math.min(absCursorLine, currentInputLinesCount - 1));

      // ── Build the footer (infos below the box) ───────────────────
      const infoSegments = [];
      // Plan / Build mode indicator (only colored element)
      const mode = config.plansMode ? 'plan (tab)' : 'build (tab)';
      infoSegments.push(C.warn(mode));
      // Model + effort (muted)
      const modelName = (config.defaultModel || '').split('/').pop() || 'unknown';
      const effort = config.defaultEffort || 'medium';
      infoSegments.push(C.muted(`${modelName} (${effort})`));
      if (stats) {
        const limit = stats.contextLimit || 128000;
        const ctxTokens = stats.lastPromptTokens || stats.estimatedContextTokens || 0;
        if (ctxTokens > 0) {
          const pct = Math.round((ctxTokens / limit) * 100);
          infoSegments.push(C.muted(`tokens: ${fmtK(ctxTokens)} / ${fmtK(limit)} (${pct}%)`));
        }
      }
      if (mcpInfo) infoSegments.push(C.muted(`MCP: ${mcpInfo}`));
      const footerLine = infoSegments.length > 0
        ? '  ' + infoSegments.join(C.muted(' · '))
        : '';

      // ── Build autocomplete matches ───────────────────────────────
      const matches = getMatches();
      const matchLines = [];
      if (matches.length > 0) {
        matches.forEach((cmd, idx) => {
          const isSelected = idx === selectedIndex;
          const cmdStr = cmd.name.padEnd(16);
          const descStr = C.muted(cmd.desc);
          if (isSelected) {
            matchLines.push(`  ${C.accent('❯')} ${C.bold(C.accent(cmdStr))} ${descStr}`);
          } else {
            matchLines.push(`    ${C.fg(cmdStr)} ${descStr}`);
          }
        });
      }

      // Total height of the block that was drawn previously
      const linesAbove = 1; // top border
      const linesBelow = 1 + matchLines.length + (footerLine ? 1 : 0); // bottom border + matches + footer
      const oldBlockHeight = linesAbove + lastInputLinesCount + lastRenderedHeight;

      // Cursor is on the input line (left there by previous render).
      // Move up from input line to the top border of the old block.
      const distToTop = linesAbove + lastCursorLine;

      if (distToTop > 0 && lastRenderedHeight > 0) {
        process.stdout.write(`\x1B[${distToTop}A`);
      }

      // ── Re-draw every line (safe: only clears each line, never erases below) ─

      // Top border
      process.stdout.write('\r\x1B[K' + C.muted('  ' + '─'.repeat(lineW)) + '\n');

      // The writing field (prompt glyph + input / placeholder)
      const styledPrompt = C.accent('❯') + ' ';
      const displayInput = input === '' && placeholder
        ? C.muted(placeholder)
        : C.fg(input);
      process.stdout.write('\r\x1B[K' + styledPrompt + displayInput + '\n');

      // Bottom border
      process.stdout.write('\r\x1B[K' + C.muted('  ' + '─'.repeat(lineW)) + '\n');

      // Autocomplete dropdown (if any)
      if (matchLines.length > 0) {
        for (const ml of matchLines) {
          process.stdout.write('\r\x1B[K' + ml + '\n');
        }
      }

      // Footer infos (below the box)
      if (footerLine) {
        process.stdout.write('\r\x1B[K' + footerLine + '\n');
      }

      // Compute how many lines we just drew
      const newTotal = linesAbove + currentInputLinesCount + linesBelow;

      // If old block was taller, clear the leftover lines
      if (newTotal < oldBlockHeight) {
        for (let i = 0; i < oldBlockHeight - newTotal; i++) {
          process.stdout.write('\r\x1B[K\n');
        }
        process.stdout.write(`\x1B[${oldBlockHeight - newTotal}A`);
      }

      // Reposition the cursor onto the correct prompt line
      const cursorFromBottom = linesBelow + (currentInputLinesCount - absCursorLine);
      if (cursorFromBottom > 0) {
        process.stdout.write(`\x1B[${cursorFromBottom}A`);
      }
      process.stdout.write('\r');
      const prefixLen = inputParts.slice(0, absCursorLine).join('\n').length;
      const cursorCol = (absCursorLine === 0 ? promptLength : 0)
        + cursor - prefixLen - (absCursorLine > 0 ? 1 : 0);
      if (cursorCol > 0) {
        process.stdout.write(`\x1B[${cursorCol}C`);
      }

      lastInputLinesCount = currentInputLinesCount;
      lastCursorLine = absCursorLine;
      lastRenderedHeight = linesBelow;
    }

    render();

    const onKeypress = (str, key) => {
      const matches = getMatches();

      if (key.ctrl && key.name === 'c') {
        cleanup();
        process.exit(0);
      }

      if (key.name === 'escape') {
        // Esc cancels the current draft — clear the input without sending.
        input = '';
        cursor = 0;
        selectedIndex = 0;
        render();
        return;
      }

      if (key.name === 'return' || key.name === 'enter') {
        // When typing a command prefix that matches autocomplete entries,
        // commit the highlighted suggestion instead of sending the raw
        // incomplete prefix as a prompt to the agent.
        if (input.startsWith('/') && matches.length > 0) {
          input = matches[selectedIndex].name;
        }
        cleanup();
        resolve(input);
        return;
      }

      if (key.name === 'backspace') {
        if (cursor > 0) {
          input = input.slice(0, cursor - 1) + input.slice(cursor);
          cursor--;
          selectedIndex = 0;
        }
      } else if (key.name === 'delete') {
        if (cursor < input.length) {
          input = input.slice(0, cursor) + input.slice(cursor + 1);
          selectedIndex = 0;
        }
      } else if (key.name === 'left') {
        if (cursor > 0) cursor--;
      } else if (key.name === 'right') {
        if (cursor < input.length) cursor++;
      } else if (key.name === 'up') {
        if (matches.length > 0) {
          selectedIndex = (selectedIndex - 1 + matches.length) % matches.length;
        }
      } else if (key.name === 'down') {
        if (matches.length > 0) {
          selectedIndex = (selectedIndex + 1) % matches.length;
        }
      } else if (key.name === 'tab') {
        if (matches.length > 0) {
          const selectedCmd = matches[selectedIndex];
          input = selectedCmd.name;
          cursor = input.length;
          selectedIndex = 0;
        } else {
          config.plansMode = !config.plansMode;
        }
      } else if (key.ctrl && key.name === 't') {
        const efforts = ['low', 'medium', 'high'];
        const currentEffort = config.defaultEffort || 'low';
        const nextIdx = (efforts.indexOf(currentEffort) + 1) % efforts.length;
        config.defaultEffort = efforts[nextIdx];
      } else if (key.ctrl && key.name === 'p') {
        config.expandThinking = config.expandThinking !== false ? false : true;
      } else if (str && !key.meta && !key.ctrl && key.name !== 'escape') {
        input = input.slice(0, cursor) + str + input.slice(cursor);
        cursor += str.length;
        selectedIndex = 0;
      }

      render();
    };

    function cleanup() {
      // Cursor is on the input line. Move up to the top border of the box,
      // then erase the entire prompt block (safe: nothing below it to destroy).
      const distToTop = 1 /* top border */ + lastCursorLine;
      if (distToTop > 0) {
        process.stdout.write(`\x1B[${distToTop}A`);
      }
      process.stdout.write('\r\x1B[J');

      // Print submitted user message with styled prompt + breathing room
      // (leading \n separates the echo from the status bar above it).
      process.stdout.write('\n' + C.accent('❯') + ' ' + C.bold(C.fg(input)) + '\n');

      process.stdin.removeListener('keypress', onKeypress);
      process.stdin.setRawMode(isRaw);
      process.stdin.pause();
    }

    process.stdin.on('keypress', onKeypress);
  });
}

// ──────────────────────────────────────────────────────────────
//  Custom Switch Session Selection Prompt (with Deletion support)
// ──────────────────────────────────────────────────────────────

export function promptSwitchSession(sessions, deleteSessionFn) {
  return new Promise((resolve) => {
    if (typeof process.stdin.setRawMode !== 'function') {
      resolve(sessions.length > 0 ? sessions[0].id : null);
      return;
    }

    const isRaw = process.stdin.isRaw;
    process.stdin.setRawMode(true);
    process.stdin.resume();
    readline.emitKeypressEvents(process.stdin);

    let activeSessions = [...sessions];
    let selectedIndex = 0;
    let confirmingDeleteIndex = -1;

    let lastRenderedHeight = 0;

    function render() {
      if (lastRenderedHeight > 0) {
        for (let i = 0; i < lastRenderedHeight; i++) {
          process.stdout.write('\x1B[1A\x1B[2K');
        }
      }

      let lines = [];
      lines.push(`${C.accent('?')} Select a conversation to resume: ${C.muted('(Ctrl+D to delete session)')}`);

      if (activeSessions.length === 0) {
        lines.push(`  ${C.warn('No conversation history found.')}`);
      } else {
        activeSessions.forEach((s, idx) => {
          const isSelected = idx === selectedIndex;
          const dateStr = new Date(s.updatedAt).toLocaleString();
          const label = `${s.summary} ${C.muted(dateStr)}`;

          if (confirmingDeleteIndex === idx) {
            lines.push(`  ${C.red('▶')} ${C.bold(C.red('Delete session?'))} Press ${C.bold('y')} to confirm or any other key to cancel`);
          } else if (isSelected) {
            lines.push(`  ${C.accent('●')} ${C.bold(label)}`);
          } else {
            lines.push(`  ${C.muted('○')} ${label}`);
          }
        });
      }

      process.stdout.write(lines.join('\n') + '\n');
      lastRenderedHeight = lines.length;
    }

    render();

    const onKeypress = (str, key) => {
      if (key.ctrl && key.name === 'c') {
        cleanup();
        resolve(null);
        return;
      }

      if (confirmingDeleteIndex !== -1) {
        if (str && str.toLowerCase() === 'y') {
          const toDelete = activeSessions[confirmingDeleteIndex];
          deleteSessionFn(toDelete.id);
          activeSessions.splice(confirmingDeleteIndex, 1);
          if (selectedIndex >= activeSessions.length) {
            selectedIndex = Math.max(0, activeSessions.length - 1);
          }
        }
        confirmingDeleteIndex = -1;
        render();
        return;
      }

      if (activeSessions.length === 0) {
        if (key.name === 'return' || key.name === 'enter' || key.name === 'escape') {
          cleanup();
          resolve(null);
        }
        return;
      }

      if (key.ctrl && key.name === 'd') {
        confirmingDeleteIndex = selectedIndex;
        render();
        return;
      }

      if (key.name === 'up') {
        selectedIndex = (selectedIndex - 1 + activeSessions.length) % activeSessions.length;
        render();
      } else if (key.name === 'down') {
        selectedIndex = (selectedIndex + 1) % activeSessions.length;
        render();
      } else if (key.name === 'return' || key.name === 'enter') {
        cleanup();
        resolve(activeSessions[selectedIndex].id);
      } else if (key.name === 'escape') {
        cleanup();
        resolve(null);
      }
    };

    function cleanup() {
      if (lastRenderedHeight > 0) {
        for (let i = 0; i < lastRenderedHeight; i++) {
          process.stdout.write('\x1B[1A\x1B[2K');
        }
      }
      process.stdin.removeListener('keypress', onKeypress);
      process.stdin.setRawMode(isRaw);
      process.stdin.pause();
    }

    process.stdin.on('keypress', onKeypress);
  });
}
