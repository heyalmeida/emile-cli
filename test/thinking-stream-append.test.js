// thinking-stream-append.test.js — the live reasoning stream must render each
// fragment EXACTLY ONCE on any stdout (specs/2026-10-10-thinking-append-only,
// deep-dive § 7.2; P0-1).
//
// The old renderer repainted the whole accumulated block on every delta with an
// unclamped cursor-up. Once the block outgrew the viewport (or stdout was a
// pipe, where cursor movement is ignored) the older frames could never be
// erased, so the same thought stayed on screen once per delta — the "the agent
// is hallucinating" report.
//
// Method note (deep-dive § 7.3): comparing the FINAL buffer always passes,
// because the last frame is correct by definition. The artifact is the
// intermediate frames, so these tests COUNT occurrences of a unique marker
// across the raw writes and parse every cursor-up escape that was emitted.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  startThinkingStream,
  appendThinkingStream,
  endThinkingStream,
} from '../src/ui/thinking.js';
import { config } from '../src/config.js';

const MARKER = 'APPEND_ONLY_MARKER_XYZ';
const COLUMNS = 80;
const ROWS = 24;
const LINE_COUNT = 210;
const DELTA_COUNT = 30;
// The marker sits far beyond any viewport, so it can only be emitted after the
// stream has latched append-only — during the in-place phase the block is
// legitimately repainted whole (that is what a fitting block may do).
const MARKER_LINE = 100;

/** Whole lines per delta, so each delta completes the rows it introduces. */
function buildDeltas() {
  const lines = Array.from({ length: LINE_COUNT }, (_, i) => (
    i === MARKER_LINE
      ? `${MARKER} reasoning step ${i}`
      : `reasoning step ${i} about the request under discussion`
  ));
  const perDelta = Math.ceil(lines.length / DELTA_COUNT);
  const deltas = [];
  for (let i = 0; i < lines.length; i += perDelta) {
    deltas.push(lines.slice(i, i + perDelta).join('\n') + (i + perDelta < lines.length ? '\n' : ''));
  }
  return deltas;
}

function captureStdout() {
  const writes = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => { writes.push(String(chunk)); return true; };
  return {
    writes,
    text: () => writes.join(''),
    restore() { process.stdout.write = original; },
  };
}

/** Pins the terminal facts the renderer branches on; restores them afterwards. */
function pinTerminal(t, { columns = COLUMNS, rows = ROWS, isTTY = true } = {}) {
  const saved = {};
  for (const [key, value] of Object.entries({ columns, rows, isTTY })) {
    saved[key] = Object.getOwnPropertyDescriptor(process.stdout, key);
    Object.defineProperty(process.stdout, key, { value, configurable: true, writable: true });
  }
  t.after(() => {
    for (const [key, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(process.stdout, key, descriptor);
      else Object.defineProperty(process.stdout, key, { value: undefined, configurable: true, writable: true });
    }
  });
}

const stripAnsi = (text) => String(text).replace(/\x1B\[[0-9;]*m/g, '');

const occurrences = (text, needle) => text.split(needle).length - 1;

/** Every `ESC[nA` the module emitted, as numbers. */
function cursorUps(text) {
  return [...text.matchAll(/\x1B\[(\d+)A/g)].map((m) => Number(m[1]));
}

function runStream(deltas) {
  const out = captureStdout();
  try {
    startThinkingStream();
    for (const delta of deltas) appendThinkingStream(delta);
    endThinkingStream();
  } finally {
    out.restore();
  }
  return out;
}

// ── AC-01: pipe / redirect — duplication is guaranteed without the fix ───────

test('non-TTY stdout renders each fragment exactly once and never climbs', (t) => {
  pinTerminal(t, { isTTY: false, rows: ROWS });
  const out = runStream(buildDeltas());
  const text = out.text();

  assert.equal(occurrences(text, MARKER), 1, 'the marker must be emitted exactly once');
  const ups = cursorUps(text);
  assert.deepEqual(ups.filter((n) => n > 1), [], `no cursor-up above 1 on a pipe (saw ${ups.join(',') || 'none'})`);
  // A pipe cannot honor cursor movement at all, so nothing may be erased either.
  assert.doesNotMatch(text, /\x1B\[\d*A/, 'a non-TTY stdout receives no cursor-up escapes');
  const plain = stripAnsi(text);
  for (let i = 1; i < LINE_COUNT; i += 40) {
    assert.equal(occurrences(plain, `reasoning step ${i} about`), 1, `line ${i} appears once`);
  }
});

// ── AC-02: TTY smaller than the block ───────────────────────────────────────

test('a TTY shorter than the block renders the fragment once and stays in the clamp', (t) => {
  pinTerminal(t, { isTTY: true, rows: ROWS });
  const out = runStream(buildDeltas());
  const text = out.text();

  assert.equal(occurrences(text, MARKER), 1, 'the marker must be emitted exactly once');
  const ups = cursorUps(text);
  assert.ok(ups.length > 0, 'the fitting phase is expected to redraw in place');
  assert.deepEqual(ups.filter((n) => n > ROWS - 1), [], `no cursor-up above rows-1 (max seen: ${Math.max(...ups)})`);

  // After the latch the stream must never climb again.
  const appendOnlyFrom = text.indexOf(MARKER);
  const upsAfterLatch = cursorUps(text.slice(Math.max(0, appendOnlyFrom - 200)));
  assert.deepEqual(upsAfterLatch, [], 'no cursor-up once the stream latched append-only');
});

test('the whole topology of the stream is emitted once, in order', (t) => {
  pinTerminal(t, { isTTY: true, rows: ROWS });
  const text = runStream(buildDeltas()).text();

  // Every line must be present exactly once after the latch point.
  const plain = stripAnsi(text);
  for (const index of [30, 60, 120, 180, LINE_COUNT - 1]) {
    assert.equal(
      occurrences(plain, `reasoning step ${index} about`),
      1,
      `line ${index} must be rendered exactly once`,
    );
  }
  assert.match(stripAnsi(text), /✻ Thought for \d+s/, 'the footer closes the append-only block');
});

// ── AC-03: endThinkingStream cannot climb to a scrolled header ──────────────

test('endThinkingStream closes the tail instead of climbing to the header', (t) => {
  pinTerminal(t, { isTTY: true, rows: ROWS });
  const out = captureStdout();
  try {
    startThinkingStream();
    for (const delta of buildDeltas()) appendThinkingStream(delta);
    const beforeEnd = out.writes.length;
    endThinkingStream();
    const endWrites = out.writes.slice(beforeEnd).join('');
    assert.deepEqual(cursorUps(endWrites), [], 'the append-only close performs no cursor-up');
    assert.match(stripAnsi(endWrites), /✻ Thought for \d+s/, 'a fresh footer line is appended instead');
    assert.ok(/^\n/.test(endWrites), 'the open tail line is closed first');
  } finally {
    out.restore();
  }
  assert.deepEqual(cursorUps(out.text()).filter((n) => n > ROWS - 1), [], 'nothing exceeds the clamp');
});

// ── AC-04: the fitting path must keep redrawing in place ────────────────────

test('a short stream that fits still redraws in place', (t) => {
  pinTerminal(t, { isTTY: true, rows: ROWS });
  const out = captureStdout();
  try {
    startThinkingStream();
    appendThinkingStream('Check the config.');
    appendThinkingStream(' Then wire it up.');
    endThinkingStream();
  } finally {
    out.restore();
  }
  const text = out.text();
  assert.ok(cursorUps(text).length > 0, 'the in-place path must be used (it did not degrade to append-only)');
  assert.deepEqual(cursorUps(text).filter((n) => n > ROWS - 1), [], 'and stays inside the clamp');

  // The last frame carries each line once — a cumulative repaint paints one copy.
  const frames = out.writes.filter((w) => w.includes('Check the config.'));
  const lastFrame = stripAnsi(frames.at(-1));
  assert.equal(occurrences(lastFrame, 'Check the config.'), 1, 'the final frame paints the block once');
  assert.match(stripAnsi(text), /✻ Thought for \d+s/);
});

// ── AC-05: collapsed mode is untouched ──────────────────────────────────────

test('collapsed mode is unchanged: one ghost line plus one close line', (t) => {
  pinTerminal(t, { isTTY: true, rows: ROWS });
  const previous = config.expandThinking;
  config.expandThinking = false;
  t.after(() => { config.expandThinking = previous; });

  const out = captureStdout();
  try {
    startThinkingStream();
    for (const delta of buildDeltas()) appendThinkingStream(delta);
    endThinkingStream();
  } finally {
    out.restore();
  }

  const text = out.text();
  assert.doesNotMatch(text, /APPEND_ONLY_MARKER_XYZ/, 'collapsed mode never renders the reasoning body');
  assert.equal(occurrences(stripAnsi(text), '··· thinking'), 1, 'exactly one ghost start line');
  assert.equal(occurrences(stripAnsi(text), '··· thought'), 1, 'exactly one close line');
  assert.deepEqual(cursorUps(text).filter((n) => n > 1), [], 'the close climbs at most one row');
});

// ── AC-08: state must not leak between streams ──────────────────────────────

test('a second stream starts clean and does not inherit the append-only latch', (t) => {
  pinTerminal(t, { isTTY: true, rows: ROWS });
  runStream(buildDeltas()); // latches append-only, then ends

  const out = captureStdout();
  try {
    startThinkingStream();
    appendThinkingStream('Fresh reasoning after a long one.');
    endThinkingStream();
  } finally {
    out.restore();
  }

  assert.ok(cursorUps(out.text()).length > 0, 'the new stream redraws in place again');
  assert.equal(occurrences(out.text(), 'Fresh reasoning after a long one.'), 1);
});

// ── boundary: a delta that extends the open tail rewrites just that row ─────

test('a growing line rewrites only its own row', (t) => {
  pinTerminal(t, { isTTY: false });
  const out = captureStdout();
  try {
    startThinkingStream();
    appendThinkingStream('alpha');
    appendThinkingStream(' beta');
    appendThinkingStream(' gamma');
    endThinkingStream();
  } finally {
    out.restore();
  }

  const text = out.text();
  assert.equal(occurrences(text, 'alpha'), 3, 'the open row is rewritten as it grows (same row, on screen once)');
  assert.deepEqual(cursorUps(text), [], 'rewriting the open tail never climbs');
  assert.match(stripAnsi(text), /gamma/, 'the newest text is always visible');
  // Exactly one newline closes each completed row — no duplicated rows.
  assert.equal(occurrences(text, 'alpha beta gamma'), 1, 'the completed row is emitted once');
});

// ── boundary: an empty delta is a no-op ─────────────────────────────────────

test('empty deltas emit nothing', (t) => {
  pinTerminal(t, { isTTY: true });
  const out = captureStdout();
  try {
    startThinkingStream();
    const afterStart = out.writes.length;
    appendThinkingStream('');
    appendThinkingStream(undefined);
    appendThinkingStream(null);
    assert.equal(out.writes.length, afterStart, 'no write for an empty delta');
    endThinkingStream();
  } finally {
    out.restore();
  }
});