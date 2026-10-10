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
// ordinary characters fill the draft.
//
// The draft is bounded by TURN_INPUT_MAX_CHARS, which is a guard against
// unbounded memory and NOT a UX limit: the idle prompt accepts input of any
// length, so a brief pasted into a running turn must survive intact. When the
// limit is reached the OLDEST characters are dropped (the newest text is what
// the user just pasted and wants), the drop is announced once per turn, and the
// draft size appears in the footer as it approaches the cap. Nothing is ever
// discarded silently — the previous 400-character behaviour did exactly that
// and truncated a pasted brief without a word.
import readline from 'node:readline';
import { C } from './theme.js';
import { config } from '../config.js';
import { isShiftEnterKey } from './prompt-input.js';
import { clampedCursorUp } from './terminal-cursor.js';
import {
  PROMPT_MATCH_LIMIT,
  buildPromptFooterSegments,
  buildPromptLayout,
  matchPromptCommands,
  promptFrameBudget,
} from './prompt-input-persistent.js';

/**
 * Draft limit for input typed while a turn is running. Roughly a page of text:
 * generous enough that pasting a brief never loses a line, bounded so one live
 * draft cannot grow without limit. See the file header for the drop policy.
 */
export const TURN_INPUT_MAX_CHARS = 16_000;

/** Draft size at which the footer starts showing the counter. */
const DRAFT_COUNTER_THRESHOLD = Math.floor(TURN_INPUT_MAX_CHARS * 0.8);

/** Characters shown by the single-line queue preview before the `(+N chars)` marker. */
const QUEUE_PREVIEW_CHARS = 90;

/** Compact size label used by the notice and the footer counter (`12800` → `12.8k`). */
const formatK = (n) => {
  const value = (n / 1000).toFixed(1);
  return `${value.endsWith('.0') ? value.slice(0, -2) : value}k`;
};

/**
 * Bounds a draft (and its cursor) to TURN_INPUT_MAX_CHARS by dropping the
 * OLDEST characters, keeping the newest — the ones the user just typed.
 * @param {string} value
 * @param {number} cursor
 * @returns {{ value: string, cursor: number, dropped: number }}
 */
export function boundDraft(value, cursor) {
  const text = String(value || '');
  const dropped = text.length - TURN_INPUT_MAX_CHARS;
  if (dropped <= 0) return { value: text, cursor, dropped: 0 };
  return {
    value: text.slice(dropped),
    // The cursor tracks the character it was on, which moved back with the head.
    cursor: Math.max(0, cursor - dropped),
    dropped,
  };
}

/**
 * Builds the single-line queue preview. Whitespace is flattened for DISPLAY
 * only — the queued line itself is never touched. A long line carries an
 * explicit `(+N chars)` marker so the preview cannot imply that the whole text
 * was taken.
 *
 * @param {string} line
 * @returns {string}
 */
export function formatQueuePreview(line) {
  const preview = String(line || '').replace(/\s+/g, ' ');
  if (preview.length <= QUEUE_PREVIEW_CHARS) return preview;
  return `${preview.slice(0, QUEUE_PREVIEW_CHARS)}… (+${preview.length - QUEUE_PREVIEW_CHARS} chars)`;
}

/**
 * Normalizes a queued line WITHOUT rewriting its content: CRLF becomes LF,
 * control characters become spaces and the result is bounded. Tabs (`\u0009`) and
 * internal spacing are deliberately preserved — collapsing them corrupted
 * pasted code, and a tab is not a terminal-escape surface. Everything that can
 * carry an escape or corrupt the transcript (C0 except HT/LF, DEL and the C1
 * range) is still replaced, exactly as before.
 */
function sanitizeLine(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f\u0080-\u009f]/g, ' ')
    .slice(0, TURN_INPUT_MAX_CHARS);
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
    const footerSegments = buildPromptFooterSegments(promptOptions);
    // Once the draft approaches the cap, show its size in the footer so the
    // limit is visible BEFORE anything is dropped (same segment row the model /
    // token / MCP state already uses — no new panel).
    if (buffer.length > DRAFT_COUNTER_THRESHOLD) {
      footerSegments.push(C.muted(`queued draft: ${formatK(buffer.length)}/${formatK(TURN_INPUT_MAX_CHARS)}`));
    }
    const layout = buildPromptLayout({
      input: buffer,
      cursor,
      message: promptOptions.message || '❯',
      placeholder: promptOptions.placeholder || 'Enter prompt or /help',
      matches: matchPromptCommands(buffer),
      selectedIndex,
      columns,
      footerSegments,
      // Same live budget as the idle frame: the active-turn block must fit the
      // terminal too, or its climb could not reach its own top.
      maxRows: promptFrameBudget(),
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
    // Every climb in this frame is viewport-clamped and embedded in the ONE
    // write the frame is emitted as (the ADR-0003 lease makes that write the
    // atomic unit): a distance longer than the viewport cannot reach scrolled
    // rows and would land the ESC7 save slot on unrelated output.
    const reserveUp = clampedCursorUp(reserveRows);
    let output = '\n'.repeat(reserveRows) + (reserveUp > 0 ? `\x1B[${reserveUp}A` : '') + '\x1B7\n';
    for (const line of layout.lines) {
      output += `\r\x1B[K${line}\n`;
    }
    const rowsUp = clampedCursorUp(layout.height - (layout.inputRowIndex + layout.cursorRow));
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
    // Same clamp, same single write as the draw above.
    const up = clampedCursorUp(lastTopOffset);
    if (up > 0) output += `\x1B[${up}A`;
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
  // Compatible terminals now deliver a whole paste (including newlines) as
  // text instead of emitting a Return key for every pasted line.
  writeDirect('\x1B[?2004h');
  readline.emitKeypressEvents(process.stdin);

  let buffer = '';
  let cursor = 0;
  let selectedIndex = 0;
  let finished = false;
  let isPasting = false;
  // One truncation notice per turn (a 20k paste is thousands of insertions; a
  // per-insertion message would flood the transcript).
  let truncationNoticed = false;
  const live = createLiveInput(promptOptions, writeDirect);

  function currentMatches() {
    return matchPromptCommands(buffer).slice(0, PROMPT_MATCH_LIMIT);
  }

  /**
   * Applies a draft mutation and bounds the result, announcing the first drop of
   * this turn. Never drops the newest text (see boundDraft).
   * @param {string} nextValue
   * @param {number} nextCursor
   */
  function setBoundDraft(nextValue, nextCursor) {
    const bounded = boundDraft(nextValue, nextCursor);
    buffer = bounded.value;
    cursor = bounded.cursor;
    if (bounded.dropped > 0 && !truncationNoticed) {
      truncationNoticed = true;
      // Through the leased writer so the notice lands above the prompt frame,
      // exactly like the `queued:` preview does.
      process.stdout.write(
        `\r\x1B[K  ${C.dim(`⚠ queued draft reached ${formatK(TURN_INPUT_MAX_CHARS)} chars — oldest text dropped`)}\n`
      );
    }
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
    try { writeDirect('\x1B[?2004l'); } catch { /* stdout may be gone */ }
    try { process.stdin.setRawMode(wasRaw); } catch { /* stdin may be gone */ }
    process.stdin.pause();
  }

  function onKeypress(str, key = {}) {
    if (key.name === 'paste-start') {
      isPasting = true;
      return;
    }
    if (key.name === 'paste-end') {
      isPasting = false;
      return;
    }
    if (key.ctrl && key.name === 'c') {
      control?.requestStop('interrupt');
      return;
    }
    if (key.name === 'escape') {
      control?.requestStop('interrupt');
      return;
    }
    if (isShiftEnterKey(key)) {
      setBoundDraft(buffer.slice(0, cursor) + '\n' + buffer.slice(cursor), cursor + 1);
      selectedIndex = 0;
      repaint();
      return;
    }
    if (key.name === 'return' || key.name === 'enter') {
      if (isPasting) {
        // A pasted newline always lands: the draft is bounded by dropping the
        // oldest characters, never by refusing the keypress.
        setBoundDraft(buffer.slice(0, cursor) + '\n' + buffer.slice(cursor), cursor + 1);
        selectedIndex = 0;
        repaint();
        return;
      }
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
      // An all-whitespace draft is not queued — decided here rather than by
      // rewriting the user's text in sanitizeLine.
      if (line && line.trim().length > 0 && typeof onLine === 'function') onLine(line);
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
    if (str && !key.ctrl && !key.meta) {
      const text = str.replace(/\r\n?/g, '\n');
      // Accept the whole chunk, then bound the draft by dropping the oldest
      // characters: pasting a brief into a running turn must never truncate the
      // text that was just pasted (nor refuse the keypress silently).
      setBoundDraft(
        buffer.slice(0, cursor) + text + buffer.slice(cursor),
        cursor + text.length,
      );
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
