// turn-keys.js — full prompt frame that stays visible while the agent works.
//
// Design
// ------
// The agent's stream may write many lines (spinner, thinking, tool summary,
// response). Reserving a fixed row at the start of the turn drifts as the
// agent outputs more lines and ends up overlapping the live input.
//
// We do not reserve a fixed terminal region. Instead, the shared full prompt
// layout is drawn one line *below the current cursor*, using save/restore
// cursor (ESC7/ESC8) so the agent's stdout position is never disturbed. The
// frame is emitted atomically and remains visually identical to the idle
// prompt without sharing its keypress listener.
//
// Esc / Ctrl+C cancel the turn, Enter commits the line to the queue, and
// ordinary characters fill the buffer with a hard cap.
import readline from 'node:readline';
import { config } from '../config.js';
import { isShiftEnterKey } from './prompt-input.js';
import {
  PROMPT_MATCH_LIMIT,
  buildPromptFooterSegments,
  buildPromptLayout,
  matchPromptCommands,
} from './prompt-input-persistent.js';

const MAX_BUFFER_CHARS = 400;

/** Strips control characters and bounds a queued line before use. */
function sanitizeLine(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f\u0080-\u009f]/g, ' ')
    .replace(/[^\S\n]+/g, ' ')
    .trim()
    .slice(0, MAX_BUFFER_CHARS);
}

/**
 * Draws the shared full prompt below the agent-output cursor. The agent
 * cursor is saved while the real terminal cursor is left at the draft caret;
 * hide() clears the frame and restores the saved output cursor.
 */
function createLiveInput(promptOptions = {}, writeDirect = () => {}) {
  const enabled = process.stdout.isTTY !== false;
  let visible = false;
  let lastTopOffset = 0;

  function drawFrame({ buffer, cursor, selectedIndex }) {
    if (!enabled) return;
    if (visible) hideFrame();
    const columns = process.stdout.columns || 80;
    const layout = buildPromptLayout({
      input: buffer,
      cursor,
      message: promptOptions.message || '❯',
      placeholder: promptOptions.placeholder || 'Enter prompt or /help',
      matches: matchPromptCommands(buffer),
      selectedIndex,
      columns,
      footerSegments: buildPromptFooterSegments(promptOptions),
    });

    // Save the agent writer's exact cursor, draw one row below it, then move
    // the *real* cursor back into the input. The save slot is restored only
    // when another agent write needs to happen.
    // Ensure the frame has physical rows available below the agent cursor.
    // If the cursor is near the terminal bottom this scrolls once, then moves
    // back to the same logical output position before saving it. Without this
    // reservation, drawing the frame could scroll after ESC7 and make ESC8
    // restore into the prompt instead of the agent output row.
    const reserveRows = layout.height + 1;
    let output = '\n'.repeat(reserveRows) + `\x1B[${reserveRows}A\x1B7\n`;
    for (const line of layout.lines) {
      output += `\r\x1B[K${line}\n`;
    }
    const rowsUp = layout.height - (layout.inputRowIndex + layout.cursorRow);
    if (rowsUp > 0) output += `\x1B[${rowsUp}A`;
    output += '\r';
    if (layout.cursorCol + 2 > 0) {
      output += `\x1B[${layout.cursorCol + 2}C`;
    }
    writeDirect(output);
    visible = true;
    lastTopOffset = layout.inputRowIndex + layout.cursorRow;
  }

  function hideFrame() {
    if (!enabled || !visible) return;
    let output = '';
    if (lastTopOffset > 0) output += `\x1B[${lastTopOffset}A`;
    output += '\r\x1B[0J\x1B8';
    writeDirect(output);
    visible = false;
    lastTopOffset = 0;
  }

  return {
    enabled,
    draw: drawFrame,
    hide: hideFrame,
  };
}

/**
 * Listens for keys while the agent works and maintains a live input row.
 *
 * @param {object} options
 * @param {object} options.control Turn control from createTurnControl().
 * @param {(line: string) => void} [options.onLine] Called with a sanitized
 *   line when the user presses Enter.
 * @param {object} [options.promptOptions] Shared prompt stats, MCP state and
 *   optional message/placeholder overrides.
 * @returns {{ stop: () => void, redraw: () => void }} `stop()` cleans up
 *   stdin and removes the input row; `redraw()` re-anchors the row at the
 *   current cursor so the CLI can call it after each agent write.
 */
export function listenTurnKeys({ control, onLine, promptOptions = {} } = {}) {
  if (typeof process.stdin.setRawMode !== 'function' || process.stdin.isTTY === false) {
    return { stop: () => {}, redraw: () => {} };
  }

  const wasRaw = process.stdin.isRaw;
  const originalWrite = process.stdout.write;
  const writeDirect = (chunk) => originalWrite.call(process.stdout, chunk);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  readline.emitKeypressEvents(process.stdin);

  let buffer = '';
  let cursor = 0;
  let selectedIndex = 0;
  let finished = false;
  const live = createLiveInput(promptOptions, writeDirect);

  function currentMatches() {
    return matchPromptCommands(buffer).slice(0, PROMPT_MATCH_LIMIT);
  }

  function repaint() {
    live.hide();
    live.draw({ buffer, cursor, selectedIndex });
  }

  // While active, every normal stdout write is routed above the prompt. The
  // frame is removed, the saved agent cursor is restored, the write advances
  // that cursor normally, and the prompt is redrawn with its real caret.
  function interceptedWrite(...args) {
    live.hide();
    let result;
    try {
      result = originalWrite.apply(process.stdout, args);
    } finally {
      if (!finished) repaint();
    }
    return result;
  }

  process.stdout.write = interceptedWrite;
  repaint();

  function cleanup() {
    if (finished) return;
    finished = true;
    process.stdin.removeListener('keypress', onKeypress);
    live.hide();
    if (process.stdout.write === interceptedWrite) {
      process.stdout.write = originalWrite;
    }
    try { process.stdin.setRawMode(wasRaw); } catch { /* stdin may be gone */ }
    process.stdin.pause();
  }

  function onKeypress(str, key = {}) {
    if (key.ctrl && key.name === 'c') {
      control?.requestStop('interrupt');
      return;
    }
    if (key.name === 'escape') {
      control?.requestStop('interrupt');
      return;
    }
    if (isShiftEnterKey(key)) {
      if (buffer.length < MAX_BUFFER_CHARS) {
        buffer = buffer.slice(0, cursor) + '\n' + buffer.slice(cursor);
        cursor++;
        selectedIndex = 0;
        repaint();
      }
      return;
    }
    if (key.name === 'return' || key.name === 'enter') {
      const selected = currentMatches()[selectedIndex];
      if (selected && selected.name !== buffer) {
        buffer = selected.name;
        cursor = buffer.length;
        selectedIndex = 0;
        repaint();
        return;
      }
      const line = sanitizeLine(buffer);
      buffer = '';
      cursor = 0;
      selectedIndex = 0;
      repaint();
      if (line && typeof onLine === 'function') onLine(line);
      return;
    }
    if (key.name === 'backspace') {
      if (cursor > 0) {
        buffer = buffer.slice(0, cursor - 1) + buffer.slice(cursor);
        cursor--;
        selectedIndex = 0;
      }
      repaint();
      return;
    }
    if (key.name === 'delete') {
      if (cursor < buffer.length) {
        buffer = buffer.slice(0, cursor) + buffer.slice(cursor + 1);
        selectedIndex = 0;
      }
      repaint();
      return;
    }
    if (key.ctrl && key.name === 'u') {
      buffer = '';
      cursor = 0;
      selectedIndex = 0;
      repaint();
      return;
    }
    if (key.name === 'left') {
      if (cursor > 0) cursor--;
      repaint();
      return;
    }
    if (key.name === 'right') {
      if (cursor < buffer.length) cursor++;
      repaint();
      return;
    }
    if (key.name === 'up' || key.name === 'down') {
      const count = currentMatches().length;
      if (count > 0) {
        selectedIndex = key.name === 'up'
          ? (selectedIndex - 1 + count) % count
          : (selectedIndex + 1) % count;
      }
      repaint();
      return;
    }
    if (key.name === 'tab') {
      const selected = currentMatches()[selectedIndex];
      if (selected && selected.name !== buffer) {
        buffer = selected.name;
        cursor = buffer.length;
        selectedIndex = 0;
      } else {
        config.plansMode = !config.plansMode;
      }
      repaint();
      return;
    }
    if (str && !key.ctrl && !key.meta && buffer.length < MAX_BUFFER_CHARS) {
      buffer = buffer.slice(0, cursor) + str + buffer.slice(cursor);
      cursor += str.length;
      selectedIndex = 0;
      repaint();
    }
  }

  process.stdin.on('keypress', onKeypress);
  return {
    stop: cleanup,
    redraw: repaint,
  };
}
