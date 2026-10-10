// terminal-cursor.js — shared viewport clamp for cursor-up emission.
//
// Every renderer that erases or repaints a mutable block needs the same hard
// bound: an `ESC[nA` can only travel within the visible viewport, so a distance
// longer than `stdout.rows` cannot reach lines that have already scrolled into
// the scrollback. Emitting it anyway leaves those frames un-erasable, and each
// later repaint draws the block again below the previous one — the duplication
// family diagnosed in deep-dive § 7 (thinking) and § 22.2 (large paste).
//
// A non-TTY stdout (pipe, redirect, tee) cannot honor cursor movement at all,
// so it receives no escape: writers degrade to appending, never to redrawing.
// Extracted from prompt-input-persistent.js by the P0-4 fix so the thinking
// stream (P0-1) can share exactly one clamp implementation.

/** Rows the cursor can physically travel up: the viewport height minus the row
 *  it stands on. Anything above that has scrolled into the scrollback, where no
 *  escape sequence can reach it. */
export function viewportCursorUp() {
  return Math.max((process.stdout.rows || 24) - 1, 0);
}

/**
 * The bounded distance for a cursor-up request, without emitting anything.
 *
 * Renderers that must keep a whole frame in ONE `write` — the thinking stream
 * under the ADR-0003 stdout lease repaints the prompt between writes, so a
 * cursor-up sent separately would be erased before the frame it belongs to
 * arrives — embed this number in their own buffer instead of calling
 * `writeCursorUp`. Same clamp, same single source of truth.
 */
export function clampedCursorUp(rows) {
  return Math.min(Math.max(rows, 0), viewportCursorUp());
}

/** Emits a viewport-bounded cursor-up. A non-TTY stdout cannot honor cursor
 *  movement at all, so it receives none. Never erases more than fits: taller
 *  blocks degrade to scrolling, never to duplicated frames. */
export function writeCursorUp(rows) {
  if (!process.stdout.isTTY || rows <= 0) return;
  const up = clampedCursorUp(rows);
  if (up > 0) process.stdout.write(`\x1B[${up}A`);
}