// prompt-input-persistent.js — persistent inline prompt (REPL writing field).
//
// Design (codex/grok-build-style inline block, rebuilt from scratch):
//
// The whole prompt is a "block" of lines: top border, optional autocomplete
// matches, input rows, bottom border, footer. Rendering follows three hard
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
//      is always "move up lastTopOffset, erase down". Nothing else is
//      remembered, so a wrong previous state can never compound.
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

export const PROMPT_MATCH_LIMIT = 6;
const GUTTER = 2; // every block line starts with two spaces

const COMMANDS = [
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
  { name: '/rules', desc: 'Inspect user-authored project rules' },
  { name: '/thinking', desc: 'Toggle expanding/collapsing reasoning output' },
  { name: '/maxloop', desc: 'Set the agent loop iteration cap' },
  { name: '/websearch', desc: 'Control native or enhanced web search' },
  { name: '/tavily', desc: 'Configure Tavily enhanced search' },
  { name: '/firecrawl', desc: 'Configure Firecrawl page rendering' },
  { name: '/help', desc: 'Display this help menu' },
  { name: 'exit', desc: 'Quit the CLI' },
];

/** Returns slash commands matching the current prompt draft. */
export function matchPromptCommands(input = '') {
  return input.startsWith('/')
    ? COMMANDS.filter(cmd => cmd.name.startsWith(input))
    : [];
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

/**
 * Pure layout builder — the single source of truth for the prompt block.
 * @returns {{
 *   lines: string[],
 *   height: number,
 *   inputRowIndex: number,   // 0-based index of the first input row in lines
 *   cursorRow: number,       // 0-based input row where the cursor sits
 *   cursorCol: number,       // 0-based col of the cursor relative to the line start
 *   rows: Array<{ text: string, plain: string }>,
 * }}
 */
export function buildPromptLayout({
  input = '',
  cursor = 0,
  message = '❯',
  placeholder = '',
  matches = [],
  selectedIndex = 0,
  columns = 80,
  footerSegments = [],
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

  // ── Block assembly ───────────────────────────────────────────
  const visibleMatches = matches.slice(0, PROMPT_MATCH_LIMIT);
  // Clamp: a selection beyond the visible list (e.g. after completion
  // narrows the match list) would leave no highlighted row.
  selectedIndex = Math.min(selectedIndex, Math.max(visibleMatches.length - 1, 0));
  const lines = [];
  const border = C.muted('  ' + '─'.repeat(Math.max(columns - GUTTER - 2, 1)));
  lines.push(border);
  for (const [index, cmd] of visibleMatches.entries()) {
    const selected = index === selectedIndex;
    // Reserve `❯` for the actual writing field. Reusing it here made the
    // selected suggestion look like a second prompt/input row.
    const marker = selected ? C.accent('●') : C.muted('・');
    const label = `${cmd.name.padEnd(15)} ${C.muted(cmd.desc)}`;
    lines.push(`  ${marker} ${selected ? C.bold(C.accent(label)) : C.fg(label)}`);
  }
  if (visibleMatches.length > 0) lines.push(border);
  const inputRowIndex = lines.length;
  for (const [index, row] of rows.entries()) {
    if (index === 0) {
      lines.push(`  ${C.accent(promptStr)} ${row.text}`);
    } else {
      lines.push(`  ${' '.repeat(promptLength)}${row.text}`);
    }
  }
  lines.push(border);
  if (footerSegments.length > 0) {
    lines.push('  ' + footerSegments.join(C.muted(' · ')));
  }

  // ── Final clip: every line fits in `columns` visible cells ───
  const clipped = lines.map(line => clipLine(line, columns));

  return {
    lines: clipped,
    height: clipped.length,
    inputRowIndex,
    cursorRow,
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
  };
}

function buildFooterInfo(stats, modelName, modelInfo, supportsReasoning, effort, mcpInfo) {
  const infoSegments = [];
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
  message = '❯',
  placeholder = 'Enter prompt or /help',
  initial = '',
  stats = null,
  sessionId = '',
  mcpInfo = null,
  busyLabel = null,
  busy = null,
  onCancel = null,
  onReady = null,
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
    let settled = false;
    let keypressAttached = false;
    let isPasting = false;

    function footerSegments() {
      return buildPromptFooterSegments({ stats, mcpInfo });
    }

    function currentMatches() {
      return matchPromptCommands(input);
    }

    function erasePreviousBlock() {
      if (lastTopOffset === null) return;
      if (lastTopOffset > 0) {
        process.stdout.write(`\x1B[${lastTopOffset}A`);
      }
      process.stdout.write('\r\x1B[0J');
      lastTopOffset = null;
    }

    function render() {
      // While the agent turn is running, the agent owns the output area
      // below the submitted message. Redrawing (and especially erasing)
      // the prompt block here would wipe/interleave agent output — the
      // block is redrawn once when the turn ends via the redraw() handle.
      if (busy?.isBusy() || submitInFlight) return;
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
      });

      erasePreviousBlock();

      // Write the block. Each line ends with \n, so afterwards the cursor
      // sits exactly one line below the block at column 1 — a known
      // position, by construction.
      let out = '';
      for (const line of layout.lines) {
        out += `\r\x1B[K${line}\n`;
      }
      process.stdout.write(out);

      // Move the cursor back onto the input row.
      const rowsUp = layout.height - (layout.inputRowIndex + layout.cursorRow);
      if (rowsUp > 0) {
        process.stdout.write(`\x1B[${rowsUp}A`);
      }
      if (layout.cursorCol > 0) {
        // +GUTTER accounts for the two-space prefix every line carries.
        process.stdout.write(`\x1B[${layout.cursorCol + GUTTER}C`);
      }

      // Remember where the block top is, relative to the cursor we just
      // positioned: inputRowIndex rows above the first input row, plus the
      // cursor row inside the input area.
      lastTopOffset = layout.inputRowIndex + layout.cursorRow;
    }

    let submitInFlight = false;

    function suspendInput() {
      if (!keypressAttached) return;
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
        return;
      }
      if (key.name === 'paste-end') {
        isPasting = false;
        return;
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
          input = selected.name;
          cursor = input.length;
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
          input = selected.name;
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
