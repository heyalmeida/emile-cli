// commit-frontier.js — the one-way commit frontier for finalized output.
//
// Ported invariant-for-invariant from the reference pager (grok-build):
//
//   - print-once and "a failed write leaves the block uncommitted so the next
//     frame retries": `crates/codegen/xai-grok-pager-minimal/src/commit.rs:145-168`
//     (`commit_leading_run` — a `false` return from the emit callback stops the
//     walk with the entry uncommitted, so nothing is ever marked committed but
//     never printed);
//   - emission that moves rows into the terminal's own scrollback instead of
//     erasing them in place: `crates/codegen/xai-ratatui-inline/src/terminal.rs:661-687`
//     (`insert_before_rows`), with the overflow released rather than clipped
//     back (`set_viewport_height`, same file, `:692-733`);
//   - the DEC 2026 synchronized-output wrapper around a multi-row frame:
//     `crates/codegen/xai-grok-pager-render/src/render/draw.rs:500-516` (the
//     `BEGIN`/`END` literals are asserted at `:750-751`), deliberately omitted
//     when tmux is the immediate terminal (`crates/codegen/xai-grok-pager-render/src/terminal/tmux.rs:50-57`).
//
// Three hard rules, which together make the duplication family (deep-dive § 7
// thinking, § 22.2 large paste, the "prompt cortado" remnant) impossible rather
// than merely clamped:
//
//   1. A finalized block is written ONCE. Committing an id that is already
//      committed is a no-op, however many times a caller re-renders its frame.
//   2. A write that throws leaves the block UNCOMMITTED and queued; the next
//      `commit()` retries it, in commit order.
//   3. This module only ever APPENDS: text plus a trailing newline, never an
//      erase and never a cursor-up. Rows that no longer fit the live region are
//      released to the terminal, which scrolls them into its own scrollback.
//
// `write` is injected and `rows` may be a thunk, so the module stays pure at the
// boundary: tests drive it with a capture function, and the caller keeps owning
// the real stdout (which may be leased — see ADR-0003, `ui/turn-keys.js`).

/** DEC 2026 — a terminal presents everything between the markers atomically. */
export const SYNCHRONIZED_BEGIN = '\x1B[?2026h';
export const SYNCHRONIZED_END = '\x1B[?2026l';

/** Default viewport height, mirroring `ui/terminal-cursor.js`. */
const DEFAULT_ROWS = 24;

/**
 * Whether a frame may be wrapped in synchronized output.
 *
 * The reference omits the wrapper when tmux is the immediate terminal — tmux
 * repaints the pane when a block closes and already synchronizes its own output
 * toward the outer terminal. Emile cannot tell an editor `:terminal` from a
 * plain pane, so `$TMUX` is the port of that exception.
 *
 * A non-TTY stdout (pipe, redirect, `tee`, a CI log) also receives nothing: the
 * markers are a presentation feature, and every other cursor escape in emile is
 * already suppressed there (`ui/terminal-cursor.js`).
 */
export function shouldEmitSynchronizedOutput({ env = process.env, isTTY = process.stdout.isTTY } = {}) {
  return isTTY !== false && !env.TMUX;
}

/** Wraps a multi-row frame in DEC 2026, or returns it untouched. */
export function wrapSynchronizedOutput(text, options = {}) {
  if (!shouldEmitSynchronizedOutput(options)) return text;
  return `${SYNCHRONIZED_BEGIN}${text}${SYNCHRONIZED_END}`;
}

/** Rows a committed block occupies: one per newline, at least one. */
function blockRows(text) {
  if (typeof text !== 'string' || text.length === 0) return 0;
  return Math.max((text.match(/\n/g) || []).length, 1);
}

/** A committed block always closes its own line, so the next write starts clean. */
function withTrailingNewline(text) {
  if (text.length === 0 || text.endsWith('\n')) return text;
  return `${text}\n`;
}

function normalizeBlock(block) {
  if (typeof block === 'string') return { id: null, text: block };
  return { id: block?.id ?? null, text: String(block?.text ?? '') };
}

/**
 * Creates a commit frontier.
 *
 * @param {object} options
 * @param {(chunk: string) => unknown} options.write Injected sink (never
 *   `process.stdout` directly — the caller owns the stream so the ADR-0003
 *   lease keeps arbitrating).
 * @param {number | (() => number)} [options.rows] Terminal height, read on every
 *   commit so a resize is honoured. The live region is `rows - 1` rows: the row
 *   the cursor stands on cannot be reached by a cursor-up either.
 * @param {object} [options.env] Environment used for the tmux exception.
 * @param {boolean | (() => boolean)} [options.isTTY] Whether stdout is a TTY.
 * @returns {{
 *   commit: (block: ({ id?: string, text: string } | string)) => boolean,
 *   isCommitted: (id: string) => boolean,
 *   pendingCount: () => number,
 *   liveRows: () => number,
 *   releasedRows: () => number,
 * }}
 */
export function createFrontier({
  write,
  rows = () => process.stdout.rows,
  env = process.env,
  isTTY = () => process.stdout.isTTY,
} = {}) {
  if (typeof write !== 'function') {
    throw new TypeError('createFrontier requires a write(chunk) function');
  }

  const committedIds = new Set();
  const pending = [];
  let committedRows = 0;

  /** Rows the live region may hold — everything above it has scrolled away. */
  function liveRegionRows() {
    const value = typeof rows === 'function' ? rows() : rows;
    const total = Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_ROWS;
    return Math.max(total - 1, 0);
  }

  function emit(entry) {
    const multiRow = entry.rows > 1;
    const chunk = multiRow
      ? wrapSynchronizedOutput(entry.text, { env, isTTY: resolveIsTTY() })
      : entry.text;
    write(chunk);
  }

  function resolveIsTTY() {
    return typeof isTTY === 'function' ? isTTY() : isTTY;
  }

  function markCommitted(entry) {
    if (entry.id !== null) committedIds.add(entry.id);
    committedRows += entry.rows;
  }

  /** @returns {boolean} whether the block reached the terminal. */
  function writeOnce(entry) {
    try {
      emit(entry);
    } catch {
      return false;
    }
    markCommitted(entry);
    return true;
  }

  /** Retries the queued blocks in commit order, stopping at the first failure
   *  (the reference stops its walk exactly there, so ordering never drifts). */
  function flushPending() {
    while (pending.length > 0) {
      if (!writeOnce(pending[0])) return;
      pending.shift();
    }
  }

  return {
    /**
     * Writes a finalized block once. Returns `true` when the block is committed
     * (now, or already), `false` when the write failed — in which case the block
     * stays queued and the next `commit()` retries it.
     */
    commit(block) {
      const entry = normalizeBlock(block);
      entry.text = withTrailingNewline(entry.text);
      entry.rows = blockRows(entry.text);
      if (entry.id !== null && committedIds.has(entry.id)) return true;
      // An empty block has nothing to append. Writing the empty chunk anyway
      // would cost a lease repaint (ADR-0003) for no output at all.
      if (entry.text.length === 0) {
        markCommitted(entry);
        return true;
      }

      flushPending();
      if (entry.id !== null && committedIds.has(entry.id)) return true;
      if (writeOnce(entry)) return true;

      pending.push(entry);
      return false;
    },

    /** Whether an id has been committed. Print-once is keyed on this. */
    isCommitted(id) {
      return committedIds.has(id);
    },

    /** Blocks whose write failed and that the next commit will retry. */
    pendingCount() {
      return pending.length;
    },

    /** Committed rows still inside the live region. */
    liveRows() {
      return Math.min(committedRows, liveRegionRows());
    },

    /** Committed rows the terminal has scrolled out of the live region —
     *  released to its own scrollback, never erased and never repainted. */
    releasedRows() {
      return committedRows - Math.min(committedRows, liveRegionRows());
    },
  };
}