// prompt-input.js — ui/ module tree (extracted from the former src/ui.js monolith).
// See docs/architecture.md for the module map.
import { C, stripAnsi, wrapText, fmtK } from './theme.js';
import { config } from '../config.js';
import { getModelInfo } from '../models.js';
import readline from 'node:readline';
import { printUserMessage } from './user-message.js';

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

    // One blank line above the prompt block — vertical rhythm gap between the
    // session bar (or any block above) and the writing field. Printed ONCE
    // before the first render and never erased: the redraw logic only moves
    // the cursor up to the top border of the prompt block, so this line stays.
    process.stdout.write('\n');

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
      { name: '/rules', desc: 'Inspect user-authored project rules' },
      { name: '/thinking', desc: 'Toggle expanding/collapsing reasoning output' },
      { name: '/maxloop', desc: 'Set the agent loop iteration cap' },
      { name: '/websearch', desc: 'Control native or enhanced web search' },
      { name: '/tavily', desc: 'Configure Tavily enhanced search' },
      { name: '/firecrawl', desc: 'Configure Firecrawl page rendering' },
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

// ──────────────────────────────────────────────────────────────
//  Prompt Input Render — spec 2026-08-25-prompt-multiline-fix
//
//  INVARIANT: the writing field is drawn as ONE explicit write per wrapped
//  row (each row ≤ terminal width, so the terminal NEVER auto-wraps). The
//  redraw math counts rows with the same wrapText() call that produced
//  them — drawn height must always equal counted height, or the cursor-up
//  erase misses lines and the screen fills with duplicated/garbage rows.
// ──────────────────────────────────────────────────────────────

    function render() {
      const columns = process.stdout.columns || 80;
      const promptStr = `${message} `;
      const promptLength = stripAnsi(promptStr).length; // '❯ ' = 2 visible chars
      const wrapW = Math.max(columns - promptLength, 10);
      const lineW = Math.max(columns - 4, 10);

      // ── Build the rendered input rows ────────────────────────────
      // One row per wrapped line; `plain` is the unstyled text used for
      // cursor math, `text` is the styled version drawn on screen.
      const inputParts = input.split('\n');
      const rows = [];
      if (input === '' && placeholder) {
        rows.push({ text: C.muted(placeholder), plain: placeholder });
      } else if (input === '') {
        rows.push({ text: '', plain: '' });
      } else {
        for (const part of inputParts) {
          if (part.length === 0) { rows.push({ text: '', plain: '' }); continue; }
          for (const r of wrapText(part, wrapW)) {
            rows.push({ text: C.fg(r), plain: r });
          }
        }
      }
      const currentInputLinesCount = Math.max(rows.length, 1);

      // ── Cursor row + column ──────────────────────────────────────
      // Walk the rendered rows tracking how many input characters each one
      // covers (+1 for the newline between parts). The cursor can NEVER
      // produce a column beyond the row width — that pushed it onto the
      // next line and corrupted the whole redraw (the multiline bug).
      let absCursorLine = rows.length - 1;
      let cursorCol = promptLength;
      {
        let consumed = 0;
        for (let i = 0; i < rows.length; i++) {
          const rowLen = rows[i].plain.length;
          if (cursor <= consumed + rowLen) {
            absCursorLine = i;
            cursorCol = promptLength + (cursor - consumed);
            break;
          }
          consumed += rowLen + 1; // +1 for the newline/piece boundary
        }
      }
      cursorCol = Math.max(promptLength, Math.min(cursorCol, columns - 1));

      // ── Build the footer (infos below the box) ───────────────────
      const infoSegments = [];
      // Plan / Build mode indicator (only colored element)
      const mode = config.plansMode ? 'plan (tab)' : 'build (tab)';
      infoSegments.push(C.warn(mode));
      // Model + effort (muted). The effort indicator only shows when the
      // model actually supports reasoning — otherwise the setting is inert
      // and showing it would be misleading.
      const modelName = (config.defaultModel || '').split('/').pop() || 'unknown';
      const effort = config.defaultEffort || 'medium';
      const supportsReasoning = getModelInfo(config.defaultModel).reasoning;
      infoSegments.push(C.muted(`${modelName}${supportsReasoning ? ` (${effort})` : ''}`));
      if (stats) {
        const limit = stats.contextLimit || getModelInfo(config.defaultModel).context;
        const isEstimated = !stats.lastPromptTokens;
        const ctxTokens = stats.lastPromptTokens || stats.estimatedContextTokens || 0;
        if (ctxTokens > 0) {
          const pct = Math.round((ctxTokens / limit) * 100);
          infoSegments.push(C.muted(`${isEstimated ? '~' : ''}tokens: ${fmtK(ctxTokens)} / ${fmtK(limit)} (${pct}%)`));
        }
        if (stats.promptTokens > 0 && stats.cachedPromptTokens > 0) {
          const hitPct = Math.round((stats.cachedPromptTokens / stats.promptTokens) * 100);
          infoSegments.push(C.success(`cache: ${hitPct}%`));
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

      let output = '';

      // Cursor is on the input line (left there by previous render).
      // Move up from input line to the top border of the old block.
      const distToTop = linesAbove + lastCursorLine;

      if (distToTop > 0 && lastRenderedHeight > 0) {
        output += `\x1B[${distToTop}A`;
      }

      // ── Re-draw every line (safe: only clears each line, never erases below) ─

      // Top border
      output += '\r\x1B[K' + C.muted('  ' + '─'.repeat(lineW)) + '\n';

      // The writing field — ONE explicit write per wrapped row, each row
      // ≤ terminal width (the terminal must never auto-wrap: auto-wrapped
      // rows are invisible to the counted height and corrupt the redraw).
      // Continuation rows indent under the prompt glyph to stay aligned.
      const styledPrompt = C.accent('❯') + ' ';
      const contIndent = ' '.repeat(promptLength);
      for (let i = 0; i < rows.length; i++) {
        const prefix = i === 0 ? styledPrompt : contIndent;
        output += '\r\x1B[K' + prefix + rows[i].text + '\n';
      }

      // Bottom border
      output += '\r\x1B[K' + C.muted('  ' + '─'.repeat(lineW)) + '\n';

      // Autocomplete dropdown (if any)
      if (matchLines.length > 0) {
        for (const ml of matchLines) {
          output += '\r\x1B[K' + ml + '\n';
        }
      }

      // Footer infos (below the box)
      if (footerLine) {
        output += '\r\x1B[K' + footerLine + '\n';
      }

      // Compute how many lines we just drew
      const newTotal = linesAbove + currentInputLinesCount + linesBelow;

      // If old block was taller, clear the leftover lines
      if (newTotal < oldBlockHeight) {
        for (let i = 0; i < oldBlockHeight - newTotal; i++) {
          output += '\r\x1B[K\n';
        }
        output += `\x1B[${oldBlockHeight - newTotal}A`;
      }

      // Reposition the cursor onto its rendered row, at its column (always
      // within the row — an overflowing column wrapped the cursor onto the
      // next line and corrupted the display)
      const cursorFromBottom = linesBelow + (currentInputLinesCount - absCursorLine);
      if (cursorFromBottom > 0) {
        output += `\x1B[${cursorFromBottom}A`;
      }
      output += '\r';
      if (cursorCol > 0) {
        output += `\x1B[${cursorCol}C`;
      }
      process.stdout.write(output);

      lastInputLinesCount = currentInputLinesCount;
      lastCursorLine = absCursorLine;
      lastRenderedHeight = linesBelow;
    }

    render();

    const onKeypress = (str, key) => {
      const matches = getMatches();
      const isShiftEnter = isShiftEnterKey(key);

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

      if (isShiftEnter) {
        input = input.slice(0, cursor) + '\n' + input.slice(cursor);
        cursor++;
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
        cleanup(true);
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
        // Toggle both live and completed reasoning output.
        config.expandThinking = config.expandThinking === true ? false : true;
      } else if (str && !key.meta && !key.ctrl && key.name !== 'escape') {
        input = input.slice(0, cursor) + str + input.slice(cursor);
        cursor += str.length;
        selectedIndex = 0;
      }

      render();
    };

    function cleanup(echoMessage = false) {
      // Cursor is on its input row. Move up to the top border of the box,
      // then erase the entire prompt block (safe: nothing below it to destroy).
      const distToTop = 1 /* top border */ + lastCursorLine;
      if (distToTop > 0) {
        process.stdout.write(`\x1B[${distToTop}A`);
      }
      process.stdout.write('\r\x1B[J');

      // On submission, echo the message as the command divider (the turn's
      // chapter marker — consistent with the history replay rendering).
      // Ctrl+C/other exits don't echo.
      if (echoMessage && input) {
        printUserMessage(input);
      }

      process.stdin.removeListener('keypress', onKeypress);
      process.stdin.setRawMode(isRaw);
      process.stdin.pause();
    }

    process.stdin.on('keypress', onKeypress);
  });
}

/**
 * Recognizes the Shift+Enter encodings emitted by readline-compatible
 * terminals. Kitty and modifyOtherKeys terminals do not always populate
 * readline's `key.shift` flag, so their CSI sequences are handled explicitly.
 */
export function isShiftEnterKey(key = {}) {
  return ((key.name === 'return' || key.name === 'enter') && key.shift === true) ||
    key.sequence === '\x1B[13;2u' || key.sequence === '\x1B[27;2;13~';
}
