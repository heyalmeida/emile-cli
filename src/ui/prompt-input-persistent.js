// prompt-input-persistent.js — persistent inline prompt (REPL writing field).
//
// Design (codex/grok-build-style inline block, rebuilt from scratch):
//
// The whole prompt is a "block" of lines: top border, optional autocomplete
// matches, input rows, bottom border, footer. Rendering follows four hard
// rules that make the cursor math provably correct:
//
//   1. EVERY line is clipped to the terminal width before being written.
//      No line ever wraps, so the displayed height always equals
//      `lines.length` — the single assumption the erase math relies on.
//   2. The layout (lines + where the cursor row/col sit inside it) is
//      computed by ONE pure function, `buildPromptLayout`, exported for
//      tests (see test/prompt-input-render.test.js, which drives a minimal
//      ANSI terminal emulator against real keypress sequences).
//   3. The only cross-render state is `lastTopOffset`: the distance in rows
//      from the cursor to the top of the block currently on screen. Erasing
//      is always "move up lastTopOffset, erase down" — and that move is
//      clamped to the viewport: a distance longer than `stdout.rows` cannot
//      reach scrolled lines, so over-erasing is never attempted (height
//      overflow degrades to scrolling, never to duplicated frames).
//   4. One burst of pasted input paints one frame. Inside a bracketed paste —
//      and inside a sub-2 ms run of text keys on terminals without bracketed
//      paste — keypresses update state only; `render()` is called once when
//      the burst ends.
//   5. The block is BUDGETED by the terminal: `buildPromptLayout` is given
//      `stdout.rows - 1` on every render and never draws more rows than that
//      (a draft that does not fit is windowed around the cursor, with dim
//      elision markers). Combined with rule 3 this makes the erase exact by
//      construction: the block can always reach its own top, so a stale frame
//      — the "prompt cortado" remnant — is structurally impossible rather
//      than merely clamped.
//   6. Erase + block + caret reposition are assembled into ONE write, wrapped
//      in DEC 2026 synchronized output (`ui/commit-frontier.js`), so the
//      terminal presents the frame atomically instead of showing the
//      half-erased intermediate state.
//
// Async submit handlers temporarily own stdin (agent-turn queue listener,
// /switch picker, /model picker, etc.). The persistent prompt detaches before
// invoking them and explicitly reacquires raw mode + resumes stdin afterwards,
// so two keypress consumers can never race and nested cleanup cannot leave the
// REPL paused.
import readline from 'node:readline';
import { C, stripAnsi, fmtK } from './theme.js';
import { config } from '../config.js';
import { getModelInfo } from '../models.js';
import { getPlanProgress } from '../plans.js';
import { printUserMessage } from './user-message.js';
import { isShiftEnterKey } from './prompt-input.js';
import { findMentionCandidates } from '../mentions.js';
import { clampedCursorUp } from './terminal-cursor.js';
import { wrapSynchronizedOutput } from './commit-frontier.js';

export const PROMPT_MATCH_LIMIT = 6;
const GUTTER = 2; // every block line starts with two spaces

/**
 * The live frame budget for the prompt block, read from the terminal on every
 * render (a resize between two renders is normal). `rows - 1` is the physical
 * bound: the row the cursor stands on cannot be reached by a cursor-up either
 * (`ui/terminal-cursor.js`). Below `PROMPT_MIN_BLOCK_ROWS` the layout sacrifices
 * chrome — the footer first, then the suggestion menu — down to the block's
 * physical minimum, so the bound is never exceeded.
 */
export function promptFrameBudget() {
  return Math.max((process.stdout.rows || 24) - 1, 1);
}

import { matchCommands as matchRegistryCommands } from '../commands/registry.js';

/** Returns slash commands matching the current prompt draft, including
 *  subcommand and argument completers from the command registry.
 *
 *  Shape is the same as before: { name, desc, mentionStart? }.
 *  When the registry suggests an argument value (e.g. a pending memory id),
 *  `name` is the value and `desc` is a short hint of the argument context.
 */
export function matchPromptCommands(input = '', ctx = {}) {
  return matchRegistryCommands(input, ctx);
}

function currentMentionFragment(input, cursor) {
  const prefix = input.slice(0, cursor);
  const match = /(?:^|\s)(@[^\s@]*)$/.exec(prefix);
  return match ? { value: match[1], start: cursor - match[1].length } : null;
}

export function matchPromptMentions(input = '', cursor = input.length) {
  const fragment = currentMentionFragment(input, cursor);
  if (!fragment) return [];
  return findMentionCandidates(fragment.value).map(path => ({ name: `@${path}`, desc: 'workspace file', mentionStart: fragment.start }));
}

/**
 * Truncates a styled line to `columns` visible cells. SGR sequences
 * (ESC[...m) count as zero width; any other char counts as one cell.
 * Guarantees the line never wraps on the terminal.
 */
export function clipLine(line, columns) {
  const max = Math.max(columns, 10);
  let width = 0;
  let out = '';
  let i = 0;
  let sawSgr = false;
  let truncated = false;
  while (i < line.length) {
    const ch = line[i];
    if (ch === '\x1B') {
      const m = /^\x1B\[[0-9;]*m/.exec(line.slice(i));
      if (m) { out += m[0]; i += m[0].length; sawSgr = true; continue; }
      break; // non-SGR escape — drop the rest defensively
    }
    if (width >= max) { truncated = true; break; }
    out += ch;
    width += 1;
    i += 1;
  }
  // If clipping removed a trailing color reset, add one without consuming a
  // terminal cell. A bounded line must never leak styling into the next row.
  if (truncated && sawSgr) out += '\x1B[0m';
  return out;
}

// ── Paste coalescing (deep-dive § 22.2) ─────────────────────────────
// A large paste arrives either bracketed (paste-start/paste-end) or, on
// terminals that ignore the mode, as a synchronous run of keypress events.
// Drawing on every one of them is both wasteful and visually broken: the
// erase can only reach rows still inside the viewport, so once the block is
// taller than the screen the earlier frames have already scrolled into the
// scrollback and each new line repaints the whole block — the pasted text
// appears N times. Inside a burst the state is updated and the frame is
// painted once, when the burst ends.
//
// Timing mirrors the grok-build pager: a run of PASTE_BURST_MIN_KEYS text
// keys with gaps <= PASTE_BURST_WINDOW_MS is a paste, not a typist (a human
// types an order of magnitude slower), and the burst closes after
// PASTE_BURST_QUIET_MS of silence or on the first non-text key.
const PASTE_BURST_WINDOW_MS = 2;
const PASTE_BURST_QUIET_MS = 10;
const PASTE_BURST_MIN_KEYS = 3;

/** Keypress names owned by dedicated branches in `onKeypress` — a key outside
 *  this set that carries a printable string only inserts text, which is what
 *  makes it a pasteable event.
 *
 *  `enter`/`return` are listed on purpose: a coalesced burst must never
 *  swallow a deliberate submit. Inside a bracketed paste the terminal already
 *  delimits the payload, so `isPasting` supplies that guarantee instead. */
const NON_TEXT_KEY_NAMES = new Set([
  'return', 'enter', 'backspace', 'delete',
  'left', 'right', 'up', 'down', 'tab', 'escape',
]);

/** True when a keypress only inserts its text into the draft. */
function isTextKeypress(str, key = {}) {
  if (!str || key.ctrl || key.meta) return false;
  if (isShiftEnterKey(key)) return false;
  return !NON_TEXT_KEY_NAMES.has(key.name);
}

/** Rows the block needs at the very least (two borders plus one input row), and
 *  the floor the caller applies to the live frame budget. Below this the
 *  terminal cannot hold even the block's fixed chrome. */
export const PROMPT_MIN_BLOCK_ROWS = 6;

/** Elision rows a windowed draft may consume: `⌃ earlier` + `⌄ later`. */
const ELISION_MARKER_ROWS = 2;

/** Pluralises an elision count (`1 earlier row` / `12 earlier rows`). */
function elisionLabel(count, side) {
  return `${count} ${side} row${count === 1 ? '' : 's'}`;
}

/**
 * Fits the block's fixed chrome to the live frame budget by shrinking the two
 * optional sections — the footer first (informational), then the suggestion menu
 * (contextual, and the only section that can lose rows without hiding the
 * draft).
 * @returns {{ menuRows: number, showFooter: boolean }}
 */
function fitChrome({ budget, menuRowCount, footerVisible }) {
  const chrome = (menu, footer) => 2 + (menu > 0 ? menu + 1 : 0) + (footer ? 1 : 0);
  let menuRows = menuRowCount;
  let showFooter = footerVisible;
  // The draft area must keep room for one input row plus both elision markers.
  while (chrome(menuRows, showFooter) + ELISION_MARKER_ROWS + 1 > budget && (showFooter || menuRows > 0)) {
    if (showFooter) showFooter = false;
    else menuRows -= 1;
  }
  return { menuRows, showFooter };
}

/**
 * Pure layout builder — the single source of truth for the prompt block.
 *
 * `maxRows` is the budget for the WHOLE assembled block, not only for the input
 * rows: this builder is the only place that knows how many menu rows exist and
 * whether a footer is present, so the chrome accounting lives here instead of
 * being re-derived (and drifting) at each call site. The caller supplies the
 * physical bound, `stdout.rows - 1`, recomputed on every render.
 *
 * **Invariant (P2-18):** `lines.length <= maxRows` always, and for any terminal
 * with `rows >= PROMPT_MIN_BLOCK_ROWS` the drawn block therefore never exceeds
 * `stdout.rows - 1` rows — so the erase can always reach its own top and a
 * stale frame is structurally impossible, not merely clamped. `cursorRow` is
 * always inside the drawn window.
 *
 * @returns {{
 *   lines: string[],
 *   height: number,
 *   inputRowIndex: number,   // 0-based index of the first DRAWN input row in lines
 *   cursorRow: number,       // 0-based drawn input row where the cursor sits
 *   cursorCol: number,       // 0-based col of the cursor relative to the line start
 *   rows: Array<{ text: string, plain: string, start: number }>, // every input row
 *   elidedEarlier: number,   // input rows hidden above the window
 *   elidedLater: number,     // input rows hidden below the window
 * }}
 */
export function buildPromptLayout({
  input = '',
  cursor = 0,
  message = '›',
  placeholder = '',
  matches = [],
  selectedIndex = 0,
  columns = 80,
  footerSegments = [],
  maxRows = Infinity,
} = {}) {
  const promptStr = `${message} `;
  const promptLength = stripAnsi(promptStr).length;
  // Visible cells available for input text on a row: gutter + prompt + space.
  const inputWidth = Math.max(columns - (GUTTER + promptLength + 1), 8);

  // ── Input rows (never wider than the terminal) ────────────────
  const rows = [];
  if (input === '' && placeholder) {
    rows.push({ text: C.muted(clipLine(placeholder, inputWidth)), plain: clipLine(placeholder, inputWidth), start: 0 });
  } else if (input === '') {
    rows.push({ text: '', plain: '', start: 0 });
  } else {
    let absoluteOffset = 0;
    const parts = input.split('\n');
    for (const [partIndex, part] of parts.entries()) {
      if (part.length === 0) {
        rows.push({ text: '', plain: '', start: absoluteOffset });
      } else {
        for (let offset = 0; offset < part.length; offset += inputWidth) {
          const chunk = part.slice(offset, offset + inputWidth);
          rows.push({ text: C.fg(chunk), plain: chunk, start: absoluteOffset + offset });
        }
        // Keep an actual row for the caret after an exactly-full final chunk;
        // positioning at terminal column `columns` would auto-wrap invisibly.
        if (part.length % inputWidth === 0) {
          rows.push({ text: '', plain: '', start: absoluteOffset + part.length });
        }
      }
      absoluteOffset += part.length + (partIndex < parts.length - 1 ? 1 : 0);
    }
  }

  // ── Cursor position inside the rows ──────────────────────────
  let cursorRow = 0;
  let cursorOffset = 0;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].start > cursor) break;
    cursorRow = i;
    cursorOffset = Math.min(Math.max(cursor - rows[i].start, 0), rows[i].plain.length);
  }

  // ── Frame budget: chrome first, then the draft window (P2-18) ─
  const budget = Number.isFinite(maxRows) && maxRows > 0 ? Math.floor(maxRows) : Infinity;
  const visibleMatches = matches.slice(0, PROMPT_MATCH_LIMIT);
  // Clamp: a selection beyond the visible list (e.g. after completion
  // narrows the match list) would leave no highlighted row.
  selectedIndex = Math.min(selectedIndex, Math.max(visibleMatches.length - 1, 0));
  const chrome = fitChrome({
    budget,
    menuRowCount: visibleMatches.length,
    footerVisible: footerSegments.length > 0,
  });
  // Window the draft around the cursor row: a draft taller than the live region
  // is never drawn whole, because the rows above it could scroll out of reach.
  const available = budget === Infinity
    ? rows.length
    : Math.max(budget - (2 + (chrome.menuRows > 0 ? chrome.menuRows + 1 : 0) + (chrome.showFooter ? 1 : 0)), 0);
  const windowing = rows.length > available;
  const windowRows = windowing ? Math.max(Math.min(available - ELISION_MARKER_ROWS, rows.length), 1) : rows.length;
  const windowStart = windowing
    ? Math.min(Math.max(cursorRow - Math.floor(windowRows / 2), 0), rows.length - windowRows)
    : 0;
  // Markers are paid for out of what the window actually leaves: a terminal too
  // small for both still reports the elision it can (see the invariant note).
  const markerSlots = Math.min(Math.max(available - windowRows, 0), ELISION_MARKER_ROWS);
  const elidedEarlier = windowing ? windowStart : 0;
  const elidedLater = windowing ? rows.length - windowStart - windowRows : 0;
  const drawnRows = windowing ? rows.slice(windowStart, windowStart + windowRows) : rows;
  // A menu that had to shrink keeps the highlighted entry visible.
  const menuOffset = chrome.menuRows < visibleMatches.length
    ? Math.min(Math.max(selectedIndex - chrome.menuRows + 1, 0), visibleMatches.length - chrome.menuRows)
    : 0;
  const menu = visibleMatches.slice(menuOffset, menuOffset + chrome.menuRows);

  // ── Block assembly ───────────────────────────────────────────
  const lines = [];
  const frameWidth = Math.max(columns - GUTTER - 3, 1);
  const topBorder = C.muted(`  ╭${'─'.repeat(frameWidth)}`);
  const bottomBorder = C.muted(`  ╰${'─'.repeat(frameWidth)}`);
  lines.push(topBorder);
  for (const [index, cmd] of menu.entries()) {
    const selected = index + menuOffset === selectedIndex;
    // Reserve `›` for the actual writing field. Reusing it here made the
    // selected suggestion look like a second prompt/input row.
    const marker = selected ? C.accent('●') : C.muted('・');
    const label = `${cmd.name.padEnd(15)} ${C.muted(cmd.desc)}`;
    lines.push(`  ${marker} ${selected ? C.bold(C.accent(label)) : C.fg(label)}`);
  }
  if (menu.length > 0) lines.push(C.muted(`  ├${'─'.repeat(frameWidth)}`));
  if (elidedEarlier > 0 && markerSlots > 0) {
    lines.push(`  ${C.dim(`⌃ ${elisionLabel(elidedEarlier, 'earlier')}`)}`);
  }
  const inputRowIndex = lines.length;
  for (const [index, row] of drawnRows.entries()) {
    // Only the draft's OWN first row carries the prompt glyph; a window that
    // starts deeper into the draft renders every row as a continuation.
    if (windowStart + index === 0) {
      lines.push(`  ${C.accent(promptStr)} ${row.text}`);
    } else {
      lines.push(`  ${' '.repeat(promptLength)}${row.text}`);
    }
  }
  if (elidedLater > 0 && markerSlots > 1) {
    lines.push(`  ${C.dim(`⌄ ${elisionLabel(elidedLater, 'later')}`)}`);
  }
  lines.push(bottomBorder);
  if (chrome.showFooter) {
    lines.push('  ' + footerSegments.join(C.muted(' · ')));
  }

  // ── Final clip: every line fits in `columns` visible cells ───
  const clipped = lines.map(line => clipLine(line, columns));

  // Hard guarantee of the invariant above. It is reachable only on a terminal
  // too small to hold even the block's chrome (`rows < PROMPT_MIN_BLOCK_ROWS`),
  // a budget the caller never asks for; the cursor row sits within the first
  // `1 + menu + marker` rows, so it survives the cut.
  if (clipped.length > budget) clipped.length = budget;

  return {
    lines: clipped,
    height: clipped.length,
    inputRowIndex,
    cursorRow: windowing ? cursorRow - windowStart : cursorRow,
    // Row 0 renders as `<gutter><prompt> <text>` (an extra separator space
    // between the prompt and the text); deeper rows render as
    // `<gutter><prompt-width spaces><text>` with no separator. The cursor
    // column must account for that difference or it lands one cell behind
    // on the first row.
    cursorCol: Math.min(
      (cursorRow === 0 ? promptLength + 1 : promptLength) + cursorOffset,
      Math.max(columns - GUTTER - 1, 0),
    ),
    rows,
    elidedEarlier,
    elidedLater,
  };
}

function buildFooterInfo(stats, modelName, modelInfo, supportsReasoning, effort, mcpInfo) {
  const infoSegments = [C.warn(`${config.plansMode ? 'plan' : 'build'} (Tab)`)];
  infoSegments.push(C.muted(`${modelName}${supportsReasoning ? ` (${effort})` : ''}`));
  if (stats) {
    const limit = stats.contextLimit || modelInfo.context;
    const isEstimated = !stats.lastPromptTokens;
    const ctxTokens = stats.lastPromptTokens || stats.estimatedContextTokens || 0;
    if (ctxTokens > 0) {
      const pct = Math.round((ctxTokens / limit) * 100);
      infoSegments.push(C.muted(`${isEstimated ? '~' : ''}tokens: ${fmtK(ctxTokens)} / ${fmtK(limit)} (${pct}%)`));
    }
    if (stats.promptTokens > 0 && stats.cachedPromptTokens > 0) {
      const hitPct = Math.round((stats.cachedPromptTokens / stats.promptTokens) * 100);
      infoSegments.push(C.muted(`cache hit: ${hitPct}%`));
    }
  }
  if (mcpInfo) infoSegments.push(C.muted(`MCP: ${mcpInfo}`));
  if (config.plansMode) {
    const progress = getPlanProgress();
    if (progress) {
      const done = progress.completed >= progress.total;
      const text = `tasks: ${progress.completed}/${progress.total}`;
      infoSegments.push(done ? C.success(text) : C.warn(text));
    }
  }
  return infoSegments;
}

/** Builds the shared idle/active prompt footer from current runtime state. */
export function buildPromptFooterSegments({ stats = null, mcpInfo = null } = {}) {
  const modelInfo = getModelInfo(config.defaultModel);
  const modelName = String(config.defaultModel || '').split('/').pop();
  const supportsReasoning = modelInfo?.reasoning === true;
  const effort = config.defaultEffort || 'low';
  return buildFooterInfo(stats, modelName, modelInfo, supportsReasoning, effort, mcpInfo);
}

/**
 * Persistent prompt input. Resolves on every Enter without tearing down
 * the screen; the writing field stays on screen and clears/redraws in
 * place for every keystroke.
 */
export function persistentPromptInput({
  onSubmit,
  message = '›',
  placeholder = 'Enter prompt or /help',
  initial = '',
  stats = null,
  sessionId = '',
  mcpInfo = null,
  busyLabel = null,
  busy = null,
  onCancel = null,
  onReady = null,
  ctx = null,
} = {}) {
  return new Promise((resolve) => {
    if (typeof process.stdin.setRawMode !== 'function' || process.stdin.isTTY === false) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const loop = () => {
        rl.question(`${message} `, (answer) => {
          const verdict = onSubmit(answer);
          if (verdict === 'cancel') { rl.close(); resolve(); return; }
          loop();
        });
      };
      loop();
      return;
    }

    const isRaw = process.stdin.isRaw;
    process.stdin.setRawMode(true);
    process.stdin.resume();
    readline.emitKeypressEvents(process.stdin);

    let input = initial;
    let cursor = initial.length;
    let selectedIndex = 0;
    let lastTopOffset = null; // rows from the cursor to the top of the drawn block
    let lastBlockHeight = 0;  // rows that block drew — the bounded erase's extent
    let settled = false;
    let keypressAttached = false;
    let isPasting = false;
    // Paste-burst coalescing (see the constants above): while a burst is open
    // nothing is drawn, and `renderDeferred` remembers that a frame is owed.
    let burstKeyCount = 0;
    let burstLastKeyAt = 0;
    let burstDeferred = false;
    let renderDeferred = false;
    let burstFlushTimer = null;

    function footerSegments() {
      return buildPromptFooterSegments({ stats, mcpInfo });
    }

    function currentMatches() {
      const cmds = matchPromptCommands(input, ctx || {});
      return cmds.length ? cmds : matchPromptMentions(input, cursor);
    }

    function clearBurstFlush() {
      if (burstFlushTimer === null) return;
      clearTimeout(burstFlushTimer);
      burstFlushTimer = null;
    }

    /** Opens/extends a non-bracketed paste burst: text keys inside the 2 ms
     *  window coalesce, and the frame is repaid when the burst goes quiet. */
    function trackPasteBurst() {
      const now = Date.now();
      if (now - burstLastKeyAt > PASTE_BURST_WINDOW_MS) burstKeyCount = 0;
      burstLastKeyAt = now;
      burstKeyCount += 1;
      if (burstKeyCount < PASTE_BURST_MIN_KEYS) return;
      burstDeferred = true;
      clearBurstFlush();
      burstFlushTimer = setTimeout(endBurst, PASTE_BURST_QUIET_MS);
      // A pending flush must never be the reason the process stays alive.
      if (typeof burstFlushTimer.unref === 'function') burstFlushTimer.unref();
    }

    /** Closes the burst: the owed frame is painted before any other key acts on
     *  the draft, so the screen always matches the state that key modifies. */
    function endBurst() {
      clearBurstFlush();
      burstKeyCount = 0;
      if (!burstDeferred) return;
      burstDeferred = false;
      if (renderDeferred && !settled) render();
    }

    /**
     * The erase that precedes a frame, as a chunk, bounded to the block's OWN
     * rows.
     *
     * `ESC[0J` erased from the block top to the end of the screen, so the
     * terminal had to repaint everything below the block on every keystroke.
     * The block's rows are known exactly (the pure layout just produced them),
     * so this walks them, clearing each with `ESC[K` while stepping with
     * `ESC[1B` — cursor-down never scrolls — and returns to the block's top row,
     * which is where the next frame is drawn from.
     *
     * Clamped like every other climb: a block taller than the viewport has rows
     * in the scrollback that no cursor-up can reach, and erasing what fits beats
     * repainting the block below a frame that cannot be removed (the paste
     * duplication bug). The climb is embedded rather than written through
     * `writeCursorUp` because it belongs to the ONE write the whole frame is
     * emitted as (the lease rule, see the file header).
     */
    function eraseChunk() {
      if (lastTopOffset === null) return '';
      const rows = Math.max(lastBlockHeight, 1);
      const up = clampedCursorUp(lastTopOffset);
      lastTopOffset = null;
      lastBlockHeight = 0;
      let out = up > 0 ? `\x1B[${up}A` : '';
      for (let i = 0; i < rows; i += 1) {
        if (i > 0) out += '\x1B[1B';
        out += '\r\x1B[K';
      }
      // Back up to the block's top row: the next frame starts there. Clamped
      // like every other climb in this module — on a non-TTY stdout it is zero,
      // so the erase keeps degrading to appends instead of leaking a cursor-up
      // into a pipe (the same rule `writeCursorUp` follows).
      const back = clampedCursorUp(rows - 1);
      if (back > 0) out += `\x1B[${back}A`;
      return `${out}\r`;
    }

    /** Erases the previous block on its own — the submit path, which prints the
     *  divider next and therefore cannot share the frame's write. */
    function erasePreviousBlock() {
      const chunk = eraseChunk();
      if (chunk) process.stdout.write(chunk);
    }

    function render() {
      // While the agent turn is running, the agent owns the output area
      // below the submitted message. Redrawing (and especially erasing)
      // the prompt block here would wipe/interleave agent output — the
      // block is redrawn once when the turn ends via the redraw() handle.
      if (busy?.isBusy() || submitInFlight) return;
      // Inside a paste burst, keypresses are state updates only. The frame is
      // owed exactly once and paid when the burst ends (paste-end / endBurst).
      if (isPasting || burstDeferred) {
        renderDeferred = true;
        return;
      }
      renderDeferred = false;
      clearBurstFlush();
      const columns = process.stdout.columns || 80;
      const matches = currentMatches();
      if (process.env.EMILE_DEBUG_RENDER) process.stderr.write(`[render] input=${JSON.stringify(input)} matches=${matches.length} cursor=${cursor}\n`);
      const layout = buildPromptLayout({
        input,
        cursor,
        message,
        placeholder,
        matches,
        selectedIndex,
        columns,
        footerSegments: footerSegments(),
        // The live frame budget, recomputed on every render: a resize between
        // two renders is normal, and the block must never outgrow the terminal.
        maxRows: promptFrameBudget(),
      });

      // Erase + block + caret reposition are assembled into ONE write and
      // wrapped in synchronized output (DEC 2026), so the terminal presents the
      // frame atomically instead of showing the half-erased intermediate state.
      let out = eraseChunk();

      // Each line ends with \n, so afterwards the cursor sits exactly one line
      // below the block at column 1 — a known position, by construction.
      for (const line of layout.lines) {
        out += `\r\x1B[K${line}\n`;
      }

      // Move the cursor back onto the input row. Same viewport clamp as the
      // erase: with a draft taller than the screen the caret's row has scrolled
      // away, and an over-long cursor-up would land on unrelated output.
      const up = clampedCursorUp(layout.height - (layout.inputRowIndex + layout.cursorRow));
      if (up > 0) out += `\x1B[${up}A`;
      if (layout.cursorCol > 0) {
        // +GUTTER accounts for the two-space prefix every line carries.
        out += `\x1B[${layout.cursorCol + GUTTER}C`;
      }

      process.stdout.write(wrapSynchronizedOutput(out));

      // Remember where the block top is, relative to the cursor we just
      // positioned: inputRowIndex rows above the first input row, plus the
      // cursor row inside the input area — and how many rows the block drew,
      // which is exactly what the next bounded erase must clear.
      lastTopOffset = layout.inputRowIndex + layout.cursorRow;
      lastBlockHeight = layout.height;
    }

    let submitInFlight = false;

    function suspendInput() {
      if (!keypressAttached) return;
      // No burst may outlive stdin ownership: a flush firing while a nested
      // raw-mode owner holds the terminal would repaint the idle block there.
      clearBurstFlush();
      burstKeyCount = 0;
      burstDeferred = false;
      renderDeferred = false;
      process.stdin.removeListener('keypress', onKeypress);
      keypressAttached = false;
    }

    function resumeInput() {
      if (settled || keypressAttached) return;
      // Nested raw-mode prompts currently restore their incoming raw flag but
      // pause stdin during cleanup. Reassert both parts of our ownership.
      try { process.stdin.setRawMode(true); } catch { /* stdin may be gone */ }
      process.stdin.resume();
      // The active-turn input temporarily owns this terminal mode and
      // disables it on cleanup. Re-enable it whenever the idle prompt
      // regains stdin so pasting works again after every completed turn.
      try { process.stdout.write('\x1B[?2004h'); } catch { /* stdout may be gone */ }
      process.stdin.on('keypress', onKeypress);
      keypressAttached = true;
    }

    function finishSubmit(verdict) {
      submitInFlight = false;
      if (verdict === 'cancel') {
        shutdown();
        return;
      }
      resumeInput();
      render();
    }

    function commit() {
      const submitted = input;
      if (submitted && submitted.trim().length > 0) {
        // The cursor sits on the input row INSIDE the prompt block. Printing
        // the user message divider here would overwrite the block and leave
        // orphan borders/footer below. Erase the whole block first, then the
        // divider and everything after it flow cleanly from a clean line.
        erasePreviousBlock();
        printUserMessage(submitted);
        process.stdout.write('\n');
      }
      input = '';
      cursor = 0;
      selectedIndex = 0;
      // The callback may synchronously attach another raw-mode key listener
      // before returning its Promise. Detach first so /switch, /model and the
      // active-turn queue listener always receive exclusive stdin ownership.
      submitInFlight = true;
      suspendInput();
      let verdict;
      try {
        verdict = onSubmit?.(submitted);
      } catch {
        finishSubmit();
        return;
      }
      if (verdict && typeof verdict.then === 'function') {
        verdict.then(finishSubmit, () => finishSubmit());
        return;
      }
      finishSubmit(verdict);
    }

    function shutdown() {
      if (settled) return;
      settled = true;
      // A coalesced burst must not survive the prompt: endBurst() checks
      // `settled`, and the pending timer is cleared here so nothing can write
      // to a stdout the REPL has already handed back.
      clearBurstFlush();
      burstKeyCount = 0;
      burstDeferred = false;
      renderDeferred = false;
      suspendInput();
      // Restore the terminal mode we enabled when this prompt took ownership
      // of raw stdin. This is deliberately best-effort: stdout can be gone
      // while the process is shutting down.
      try { process.stdout.write('\x1B[?2004l'); } catch { /* stdout may be gone */ }
      try { process.stdin.setRawMode(isRaw); } catch { /* stdin may be gone */ }
      if (isRaw) process.stdin.resume();
      else process.stdin.pause();
      resolve();
    }

    function onKeypress(str, key = {}) {
      if (process.env.EMILE_DEBUG_RENDER) process.stderr.write(`[keypress] str=${JSON.stringify(str)} key=${JSON.stringify(key)}\n`);
      if (key.name === 'paste-start') {
        isPasting = true;
        // Zero renders for the whole payload. A burst that was still open folds
        // its owed frame into the single paste-end render.
        clearBurstFlush();
        burstKeyCount = 0;
        if (burstDeferred) {
          burstDeferred = false;
          renderDeferred = true;
        }
        return;
      }
      if (key.name === 'paste-end') {
        isPasting = false;
        // The one full-block redraw for everything the burst inserted. Any
        // open non-bracketed burst folds into it as well.
        clearBurstFlush();
        burstKeyCount = 0;
        burstDeferred = false;
        if (renderDeferred) render();
        return;
      }
      // Terminals that ignore bracketed paste deliver the payload as a bare
      // run of keypresses: coalesce it the same way. Detection reads keypress
      // metadata only, never the pasted content.
      if (!isPasting) {
        if (isTextKeypress(str, key)) trackPasteBurst();
        else endBurst();
      }
      if (key.ctrl && key.name === 'c') {
        // While an agent turn is running, Esc/Ctrl+C cancel the turn
        // (graceful stop) — they must NOT tear down the REPL.
        if (busy?.isBusy() && typeof onCancel === 'function') {
          onCancel();
          return;
        }
        shutdown();
        return;
      }
      if (key.name === 'escape') {
        if (busy?.isBusy() && typeof onCancel === 'function') {
          onCancel();
          return;
        }
        // Idle Esc cancels only the draft, matching promptInput/README.
        input = '';
        cursor = 0;
        selectedIndex = 0;
        render();
        return;
      }
      if (isShiftEnterKey(key)) {
        input = input.slice(0, cursor) + '\n' + input.slice(cursor);
        cursor++;
        selectedIndex = 0;
        render();
        return;
      }
      if (key.name === 'return' || key.name === 'enter') {
        if (isPasting) {
          input = input.slice(0, cursor) + '\n' + input.slice(cursor);
          cursor++;
          selectedIndex = 0;
          render();
          return;
        }
        const matches = currentMatches();
        const visible = matches.slice(0, PROMPT_MATCH_LIMIT);
        // Slash-command completion: with the menu open, the first Enter
        // completes the highlighted command; the second submits it.
        const selected = visible[selectedIndex];
        if (selected && selected.name !== input) {
          if (Number.isInteger(selected.mentionStart)) {
            input = input.slice(0, selected.mentionStart) + selected.name + input.slice(cursor);
            cursor = selected.mentionStart + selected.name.length;
          } else {
            input = selected.name;
            cursor = input.length;
          }
          render();
          return;
        }
        commit();
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
      } else if (key.ctrl && key.name === 'u') {
        input = '';
        cursor = 0;
        selectedIndex = 0;
      } else if (key.name === 'left') {
        if (cursor > 0) cursor--;
      } else if (key.name === 'right') {
        if (cursor < input.length) cursor++;
      } else if (key.name === 'up') {
        const count = currentMatches().slice(0, PROMPT_MATCH_LIMIT).length;
        if (count > 0) selectedIndex = (selectedIndex - 1 + count) % count;
      } else if (key.name === 'down') {
        const count = currentMatches().slice(0, PROMPT_MATCH_LIMIT).length;
        if (count > 0) selectedIndex = (selectedIndex + 1) % count;
      } else if (key.name === 'tab') {
        const matches = currentMatches().slice(0, PROMPT_MATCH_LIMIT);
        const selected = matches[selectedIndex];
        if (selected && selected.name !== input) {
          if (Number.isInteger(selected.mentionStart)) {
            input = input.slice(0, selected.mentionStart) + selected.name + input.slice(cursor);
            cursor = selected.mentionStart + selected.name.length;
          } else {
            input = selected.name;
            cursor = input.length;
          }
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
        config.expandThinking = config.expandThinking === true ? false : true;
      } else if (str && !key.meta && !key.ctrl && key.name !== 'escape') {
        const text = str.replace(/\r\n?/g, '\n');
        input = input.slice(0, cursor) + text + input.slice(cursor);
        cursor += text.length;
        selectedIndex = 0;
      }
      render();
    }

    resumeInput();
    // The host uses setInput for /rewind and redraw for state/footer refreshes.
    if (typeof onReady === 'function') {
      onReady({
        redraw: render,
        // The lifecycle coordinator calls this on SIGINT so an IDLE prompt
        // releases the stdin lease: remove the keypress listener, restore the
        // incoming raw mode and disable bracketed paste. It is the same teardown
        // the prompt's own Ctrl+C path uses — not a second implementation.
        shutdown,
        setInput(value) {
          input = String(value || '');
          cursor = input.length;
          selectedIndex = 0;
          render();
        },
      });
    }
    render();
  });
}
