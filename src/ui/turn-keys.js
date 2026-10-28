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
// Transition discipline (P1-16, `specs/2026-10-10-frame-transition-flicker`)
// ---------------------------------------------------------------------------
// The lease used to perform its transition in three separate writes — erase,
// agent chunk, redraw — on EVERY stdout write, which the spinner alone triggers
// every 80 ms. That presented every intermediate state to the terminal (erased
// frame without its redraw, frame without its caret) and erased with `ESC[0J`,
// i.e. from the frame top to the end of the screen.
//
// Now:
//
//   1. ONE synchronized update per transition. The whole `erase → agent
//      chunk(s) → repaint` region is wrapped in a single DEC 2026 pair, decided
//      once by `shouldEmitSynchronizedOutput()` (tmux exception and non-TTY
//      guard included, `ui/commit-frontier.js`) — never hand-rolled here.
//   2. The erase covers the frame's OWN rows and nothing else: it walks them
//      clearing each row with `ESC[K` while stepping with `ESC[1B`, which never
//      scrolls. Agent output lives above the frame's top row and is never
//      inside the erased region.
//   3. A burst of writes inside one event-loop turn is coalesced: the frame is
//      erased once, every chunk lands inside the same update, and the redraw
//      happens once (on the next immediate). The agent's bytes are still
//      written before the redraw, and a keypress settles an owed redraw before
//      it acts on the draft — the rule the paste burst already follows.
//   4. A frame that is on screen and byte-identical is not re-emitted, and not
//      erased just to be redrawn.
//   5. The row reservation is emitted only when the redraw is PROVABLY landing
//      on the rows the frame just vacated. See `buildFrame` for why an
//      estimate is not good enough.
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
import { ROLE } from './theme.js';
import { config } from '../config.js';
import { isShiftEnterKey } from './prompt-input.js';
import { clampedCursorUp } from './terminal-cursor.js';
import {
  SYNCHRONIZED_BEGIN,
  SYNCHRONIZED_END,
  shouldEmitSynchronizedOutput,
} from './commit-frontier.js';
import {
  PROMPT_MATCH_LIMIT,
  buildPromptFooterSegments,
  buildPromptLayout,
  matchPromptCommands,
  promptFrameBudget,
} from './prompt-input-persistent.js';

/** Rows an escape-free string moves the cursor DOWN by. Everything that scrolls
 *  (`\n`) plus an explicit cursor-down; `\r`, `ESC[K` and `ESC[nA` move no rows
 *  down, which is what lets a transition prove it redraws in place. */
function countDownMoves(text) {
  const newlines = (text.match(/\n/g) || []).length;
  const cursorDowns = (text.match(/\x1B\[\d*B/g) || []).length;
  return newlines + cursorDowns;
}

/** Longest line length in a chunk — a conservative upper bound on its visible
 *  width, so a line that cannot wrap is recognised without stripping SGR. */
function longestLineWidth(text) {
  return text.split('\n').reduce((max, line) => Math.max(max, line.length), 0);
}

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
 * The live frame, split into composable chunks.
 *
 * This module composes the byte strings; the caller emits them, so the whole
 * `erase → agent chunk → redraw` region can leave as ONE synchronized update
 * (see the file header). `lastTopOffset`/`lastHeight` describe the frame that is
 * — or, between an erase and its redraw, was — on screen: the frame's top row,
 * relative to the caret, and how many rows it drew.
 */
function createLiveInput(promptOptions = {}) {
  const enabled = process.stdout.isTTY !== false;
  let visible = false;
  let lastTopOffset = 0;
  let lastHeight = 0;
  let lastSignature = null;

  /**
   * The erase preceding a frame, bounded to the frame's OWN rows.
   *
   * `ESC[0J` (erase from the cursor to the end of the screen) is what made the
   * whole terminal blink: it touched every row below the frame on every
   * transition. The frame's rows are known exactly — it drew them — so this
   * walks them, clearing each with `ESC[K` while stepping with `ESC[1B`.
   * Cursor-down never scrolls (only LF/IND/NEL do), so the erase stays inside
   * the rows the frame occupies: the agent's output above the frame's top row is
   * never inside the erased region. The climb is clamped like every other one.
   *
   * The geometry is deliberately KEPT after the frame is marked hidden: the
   * redraw that follows needs it to prove it lands in place.
   */
  function takeEraseChunk() {
    if (!enabled || !visible) return '';
    const rows = Math.max(lastHeight, 1);
    let out = '';
    const up = clampedCursorUp(lastTopOffset);
    if (up > 0) out += `\x1B[${up}A`;
    for (let i = 0; i < rows; i += 1) {
      if (i > 0) out += '\x1B[1B';
      out += '\r\x1B[K';
    }
    // Restore the agent's output row, saved by the frame's own ESC7.
    out += '\x1B8';
    visible = false;
    return out;
  }

  /** True when the frame on screen is byte-identical to this one. */
  function isOnScreen(frame) {
    return enabled && visible && frame.signature !== null && frame.signature === lastSignature;
  }

  /**
   * Builds the frame for the current draft state.
   *
   * `inPlace` means the caller PROVED the redraw lands exactly on the rows the
   * frame just vacated: nothing moved the cursor down since the erase and the
   * frame did not grow. Only then is the row reservation skipped — the rows are
   * known to be on screen, so the draw cannot scroll and the `ESC7` slot the
   * erase restores cannot drift.
   *
   * An estimate is not good enough here. Reserving "only when
   * `lastTopOffset + height` exceeds the terminal height" reads as geometry but
   * is not: both terms are measured from the CARET, so for a small frame it
   * always says "fits" — including when the agent has streamed to the last row
   * of the screen, which is exactly the case the reservation exists for. There,
   * skipping it lets the frame's own draw scroll the screen after `ESC7`, and
   * `ESC8` then restores into the frame instead of the agent output row. With no
   * absolute cursor row (emile never issues a DSR query) the safe rule is the
   * proof, so the reservation stays wherever the proof does not hold.
   */
  function buildFrame({ buffer, cursor, selectedIndex }, { inPlace = false } = {}) {
    if (!enabled) return { chunk: '', signature: null, height: 0, topOffset: 0 };
    const columns = process.stdout.columns || 80;
    const footerSegments = buildPromptFooterSegments(promptOptions);
    // Once the draft approaches the cap, show its size in the footer so the
    // limit is visible BEFORE anything is dropped (same segment row the model /
    // token / MCP state already uses — no new panel).
    if (buffer.length > DRAFT_COUNTER_THRESHOLD) {
      // A counter is meta punctuation: the dimmest step of the scale.
      footerSegments.push(ROLE.meta.punct(`queued draft: ${formatK(buffer.length)}/${formatK(TURN_INPUT_MAX_CHARS)}`));
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

    let chunk = '';
    if (!(inPlace && lastHeight > 0 && layout.height <= lastHeight)) {
      // Ensure the frame has physical rows available below the agent cursor. If
      // the cursor is near the terminal bottom this scrolls once, then moves back
      // to the same logical output position BEFORE saving it: a scroll between
      // ESC7 and ESC8 is what makes ESC8 restore into the prompt.
      const reserveRows = layout.height + 1;
      const reserveUp = clampedCursorUp(reserveRows);
      chunk += '\n'.repeat(reserveRows) + (reserveUp > 0 ? `\x1B[${reserveUp}A` : '');
    }
    // Save the agent writer's exact cursor, draw one row below it, then move the
    // *real* cursor back into the input. Every climb is viewport-clamped: a
    // distance longer than the viewport cannot reach scrolled rows and would
    // land the ESC7 save slot on unrelated output.
    chunk += '\x1B7\n';
    for (const line of layout.lines) {
      chunk += `\r\x1B[K${line}\n`;
    }
    const rowsUp = clampedCursorUp(layout.height - (layout.inputRowIndex + layout.cursorRow));
    if (rowsUp > 0) chunk += `\x1B[${rowsUp}A`;
    chunk += '\r';
    if (layout.cursorCol + 2 > 0) {
      chunk += `\x1B[${layout.cursorCol + 2}C`;
    }

    return {
      chunk,
      // Content only — no reservation flag, no escape: two frames with the same
      // signature are the same picture on screen.
      signature: `${layout.lines.join('\n')}\u0000${layout.inputRowIndex}:${layout.cursorRow}:${layout.cursorCol}`,
      height: layout.height,
      topOffset: layout.inputRowIndex + layout.cursorRow,
    };
  }

  return {
    enabled,
    isVisible: () => visible,
    isOnScreen,
    takeEraseChunk,
    buildFrame,
    /** Records the frame as drawn and returns the chunk to emit. */
    markDrawn(frame) {
      if (!enabled) return '';
      visible = true;
      lastTopOffset = frame.topOffset;
      lastHeight = frame.height;
      lastSignature = frame.signature;
      return frame.chunk;
    },
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
  const live = createLiveInput(promptOptions);

  // ── Frame transition state (P1-16) ────────────────────────────────────────
  // `updateOpen` spans one synchronized update; `frameOwed` records that the
  // frame was erased inside it and must come back; `movedRows`/`transitionWidth`
  // accumulate what the agent's chunks did to the cursor, which is what lets the
  // redraw prove it lands in place.
  let updateOpen = false;
  let updateWrapped = false;
  let frameOwed = false;
  let flushHandle = null;
  let movedRows = 0;
  let transitionWidth = 0;

  /** The draft state the frame must show. Read at paint time, so a coalesced
   *  redraw paints the newest state instead of the first snapshot. */
  function currentPayload() {
    return { buffer, cursor, selectedIndex };
  }

  /** Opens the synchronized update unless one is already open. Both markers
   *  follow ONE decision — the reference's rule — so tmux/non-TTY can never
   *  receive half a pair. */
  function openUpdate() {
    if (updateOpen) return '';
    updateOpen = true;
    updateWrapped = shouldEmitSynchronizedOutput();
    return updateWrapped ? SYNCHRONIZED_BEGIN : '';
  }

  function closeUpdate() {
    if (!updateOpen) return '';
    updateOpen = false;
    movedRows = 0;
    transitionWidth = 0;
    const end = updateWrapped ? SYNCHRONIZED_END : '';
    updateWrapped = false;
    return end;
  }

  function clearFlush() {
    if (flushHandle === null) return;
    clearImmediate(flushHandle);
    flushHandle = null;
  }

  function scheduleFlush() {
    if (flushHandle !== null) return;
    flushHandle = setImmediate(() => { flushHandle = null; flushTransition(); });
    // A pending redraw must never be the reason the process stays alive.
    if (typeof flushHandle.unref === 'function') flushHandle.unref();
  }

  /** The one "redraw the frame" path: the coalesced flush, a keypress and the
   *  redraw() handle all end here. */
  function paintFrame({ forceErase = false } = {}) {
    clearFlush();
    // In place = the frame being replaced is on screen and did not move, or (when
    // this paint settles an open transition) nothing has moved the cursor down
    // since the erase. Both mean the draw lands on rows that are already free.
    const inPlace = updateOpen
      ? movedRows === 0 && transitionWidth <= (process.stdout.columns || 80)
      : live.isVisible();
    const frame = live.buildFrame(currentPayload(), { inPlace });
    // A byte-identical frame that is still on screen is neither re-emitted nor
    // erased just to be redrawn (the redundant-repaint half of the flicker).
    if (!frameOwed && live.isOnScreen(frame) && !forceErase) {
      const end = closeUpdate();
      if (end) writeDirect(end);
      return;
    }
    let out = openUpdate();
    if (live.isVisible() && (forceErase || !live.isOnScreen(frame))) out += live.takeEraseChunk();
    out += live.markDrawn(frame);
    out += closeUpdate();
    frameOwed = false;
    if (out) writeDirect(out);
  }

  /** Closes the transition: paints the owed frame once (or drops it when the
   *  turn is ending) and terminates the synchronized update. */
  function flushTransition({ paint = true } = {}) {
    clearFlush();
    let out = '';
    if (frameOwed) {
      frameOwed = false;
      if (paint) {
        // In place = the chunks moved the cursor down by zero rows and none of
        // them could have wrapped, so the frame lands on the rows it just vacated.
        const inPlace = movedRows === 0 && transitionWidth <= (process.stdout.columns || 80);
        out += live.markDrawn(live.buildFrame(currentPayload(), { inPlace }));
      }
    }
    out += closeUpdate();
    if (out) writeDirect(out);
  }

  /** The agent's chunk as text, or null when it cannot be inspected (then
   *  nothing is assumed about the cursor). */
  function chunkText(args) {
    const first = args[0];
    if (typeof first === 'string') return first;
    if (first == null) return '';
    if (Buffer.isBuffer(first)) return first.toString('utf8');
    if (first instanceof Uint8Array) return Buffer.from(first).toString('utf8');
    return null;
  }

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
        `\r\x1B[K  ${ROLE.meta.punct(`⚠ queued draft reached ${formatK(TURN_INPUT_MAX_CHARS)} chars — oldest text dropped`)}\n`
      );
    }
  }

  /** Repaints the frame now — the keypress path and the exposed redraw() handle.
   *  A redraw owed by an earlier write in this same turn is settled first, so
   *  the screen matches the state the key is about to act on. */
  function repaint() {
    paintFrame();
  }

  // While active, every normal stdout write is routed above the prompt. The
  // whole transition — erase, the agent's bytes, the redraw — happens inside ONE
  // synchronized update, so the terminal never presents an intermediate state.
  function interceptedWrite(...args) {
    const text = chunkText(args);
    // An empty write moves nothing: no transition, so the frame is not touched.
    if (text !== null && text.length === 0) return originalWrite.apply(process.stdout, args);

    let out = '';
    if (!updateOpen) {
      out += openUpdate();
      // Erased exactly once per transition, bounded to the frame's own rows.
      const erase = live.takeEraseChunk();
      if (erase) {
        out += erase;
        frameOwed = true;
      }
      movedRows = 0;
      transitionWidth = 0;
    }
    if (out) writeDirect(out);

    let result;
    try {
      result = originalWrite.apply(process.stdout, args);
    } finally {
      if (text === null) movedRows = Number.POSITIVE_INFINITY;
      else {
        movedRows += countDownMoves(text);
        transitionWidth = Math.max(transitionWidth, longestLineWidth(text));
      }
      // The redraw is deferred so a burst inside one event-loop turn paints the
      // frame once, after every chunk has landed above it.
      if (finished) flushTransition({ paint: false });
      else scheduleFlush();
    }
    return result;
  }

  process.stdout.write = interceptedWrite;
  repaint();

  function cleanup() {
    if (finished) return;
    finished = true;
    process.stdin.removeListener('keypress', onKeypress);
    // The frame leaves inside the same discipline: drop any owed redraw, erase
    // the frame with the bounded walk and close an open update in one write.
    clearFlush();
    frameOwed = false;
    let teardown = '';
    const erase = live.takeEraseChunk();
    if (erase) teardown += openUpdate() + erase;
    teardown += closeUpdate();
    if (teardown) writeDirect(teardown);
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
