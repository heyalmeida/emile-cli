// turn-input-cap.test.js — input typed or pasted while a turn is RUNNING must
// reach the queue intact (specs/2026-10-10-turn-input-cap, deep-dive P1-13).
//
// The active-turn draft used to be hard-capped at 400 characters and the excess
// was discarded without a word: the insert path stopped accepting keys once
// full, and the same gate covered Enter inside a paste, so an 8 KB paste kept
// its first 400 characters and lost every line after them. sanitizeLine also
// collapsed whitespace runs, eating tabs and indentation out of pasted code.
//
// The policy now: a 16 000-character bound, drop the OLDEST characters (keep
// what the user just pasted), announce the drop once per turn, show the draft
// size in the footer, mark the truncated preview, and never rewrite the text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import {
  listenTurnKeys,
  boundDraft,
  formatQueuePreview,
  TURN_INPUT_MAX_CHARS,
} from '../src/ui/turn-keys.js';
import { persistentPromptInput } from '../src/ui/prompt-input-persistent.js';

const NOTICE = 'queued draft reached';
const MAX = TURN_INPUT_MAX_CHARS;

// ── harness ─────────────────────────────────────────────────────────────────

function fakeStdin() {
  const ee = new EventEmitter();
  ee.setRawMode = () => ee;
  ee.resume = () => ee;
  ee.pause = () => ee;
  ee.isTTY = true;
  ee.isRaw = false;
  return ee;
}

/**
 * Registers teardown on a LIFO stack. `t.after` runs callbacks in registration
 * order, which is wrong for nested swaps (a test that stages two turns would
 * restore stdout to a stale stub and swallow the runner's own output) — the
 * stack unwinds in reverse so every swap is undone in the order it happened.
 */
function cleanupStack(t) {
  const restores = [];
  t.after(() => {
    for (let i = restores.length - 1; i >= 0; i -= 1) restores[i]();
  });
  return (fn) => restores.push(fn);
}

function captureStdout(register) {
  const writes = [];
  const original = process.stdout.write;
  const stub = (chunk) => { writes.push(String(chunk)); return true; };
  process.stdout.write = stub;
  register(() => { process.stdout.write = original; });
  return { writes, text: () => writes.join(''), restore: () => { process.stdout.write = original; } };
}

function pinStdout(t, { columns = 80, rows = 40, isTTY = true } = {}) {
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

function swapStdin(stub) {
  const original = process.stdin;
  Object.defineProperty(process, 'stdin', { value: stub, configurable: true, writable: true });
  return () => Object.defineProperty(process, 'stdin', { value: original, configurable: true, writable: true });
}

/** Starts a real active-turn key listener over a captured stdout. */
function startTurn(t, register) {
  const stdin = fakeStdin();
  const restoreStdin = swapStdin(stdin);
  const out = captureStdout(register);
  const queued = [];
  const keys = listenTurnKeys({
    control: { requestStop() {}, shouldStop: () => false },
    onLine: (line) => queued.push(line),
    promptOptions: {},
  });
  // Reverse order on teardown: stop the listener, un-patch stdout, restore stdin.
  register(() => keys.stop());
  register(restoreStdin);
  return {
    stdin,
    out,
    queued,
    keys,
    type: (str, key = {}) => stdin.emit('keypress', str, key),
    stop: () => keys.stop(),
  };
}

const stripAnsi = (text) => String(text).replace(/\x1B\[[0-9;]*[A-Za-z]/g, '');
const count = (text, needle) => text.split(needle).length - 1;

// ── AC-01 / AC-02: the bound is generous, drops the OLDEST, and speaks up ────

test('a 20 000-char paste keeps the newest 16 000 chars and warns exactly once', (t) => {
  pinStdout(t);
  const turn = startTurn(t, cleanupStack(t));
  // Distinguishable head and tail so "newest survived" is unambiguous.
  const payload = `${'A'.repeat(4000)}${'B'.repeat(16000)}`;
  assert.equal(payload.length, 20000);

  turn.type(payload, {});
  turn.type('', { name: 'return' });

  assert.equal(turn.queued.length, 1, 'the draft was queued');
  const queued = turn.queued[0];
  assert.equal(queued.length, MAX, `queued length is exactly the cap (got ${queued.length})`);
  assert.equal(queued, 'B'.repeat(16000), 'the NEWEST text survived and the oldest 4 000 chars were dropped');
  assert.equal(count(stripAnsi(turn.out.text()), NOTICE), 1, 'the truncation notice is printed exactly once');
  assert.match(stripAnsi(turn.out.text()), /oldest text dropped/, 'and it says what happened');
});

test('a second paste appends and trims the head, never the newest text', (t) => {
  pinStdout(t);
  const turn = startTurn(t, cleanupStack(t));
  const first = 'A'.repeat(15000);
  const second = 'B'.repeat(5000);

  turn.type(first, {});
  assert.equal(turn.queued.length, 0, 'nothing is queued until Enter');
  turn.type(second, {});
  turn.type('', { name: 'return' });

  const queued = turn.queued[0];
  assert.equal(queued.length, MAX);
  assert.ok(queued.endsWith(second), 'the newest paste is intact at the tail');
  assert.equal(queued.match(/^A*/)[0].length, 11000, 'only 11 000 of the 15 000 original A chars survived');
  assert.equal(queued, 'A'.repeat(11000) + second, 'exactly the first 4 000 characters went away');
  assert.equal(count(stripAnsi(turn.out.text()), NOTICE), 1, 'still one notice for the turn');
});

test('a draft at the cap keeps accepting input', (t) => {
  pinStdout(t);
  const turn = startTurn(t, cleanupStack(t));
  turn.type('X'.repeat(17000), {});
  // Typing after the cap must still reach the draft (never a silent no-op).
  turn.type('Z', {});
  turn.type('', { name: 'return' });

  const queued = turn.queued[0];
  assert.equal(queued.length, MAX, 'still bounded to the cap');
  assert.ok(queued.endsWith('Z'), 'the newest keystroke landed at the tail');
});

test('a deletion still works at the cap', (t) => {
  pinStdout(t);
  const turn = startTurn(t, cleanupStack(t));
  turn.type('Y'.repeat(17000), {});
  turn.type('', { name: 'backspace' });
  turn.type('', { name: 'return' });
  assert.equal(turn.queued[0].length, MAX - 1, 'the deletion was applied');
});

// ── AC-03 / AC-04: content integrity at the submit boundary ─────────────────

test('tabs and internal double spaces survive into the queued line', (t) => {
  pinStdout(t);
  const turn = startTurn(t, cleanupStack(t));
  const draft = 'function f() {\n\treturn  1;   // two spaces\n}';
  turn.type(draft, {});
  turn.type('', { name: 'return' });

  assert.equal(turn.queued.length, 1);
  assert.equal(turn.queued[0], draft, 'the queued text is byte-identical to the draft (corruption regression)');
  assert.ok(turn.queued[0].includes('\t'), 'the tab is still a tab');
  assert.ok(turn.queued[0].includes('  '), 'the double space is intact');
});

test('control characters are still replaced (safety preserved)', (t) => {
  pinStdout(t);
  const turn = startTurn(t, cleanupStack(t));
  // BEL, ESC, backspace and a C1 control: the terminal-escape surface.
  turn.type('a\u0007b\u001bc\u0008d\u009be', {});
  turn.type('', { name: 'return' });

  const queued = turn.queued[0];
  assert.equal(queued, 'a b c d e', 'every control character became a space');
  assert.doesNotMatch(queued, /[\u0000-\u0008\u000b-\u001f\u007f\u0080-\u009f]/, 'no control character survives');
});

test('a CRLF paste is normalized to LF without other rewriting', (t) => {
  pinStdout(t);
  const turn = startTurn(t, cleanupStack(t));
  turn.type('one\r\ntwo\rthree\n\tfour', {});
  turn.type('', { name: 'return' });
  assert.equal(turn.queued[0], 'one\ntwo\nthree\n\tfour');
});

test('a whitespace-only draft is not queued', (t) => {
  pinStdout(t);
  const turn = startTurn(t, cleanupStack(t));
  turn.type('   \t\n  ', {});
  turn.type('', { name: 'return' });
  assert.deepEqual(turn.queued, [], 'an empty-looking draft never reaches the queue');
});

// ── AC-05: the limit is visible before it is reached ────────────────────────

test('the footer shows the draft counter past 80% of the cap and not below it', (t) => {
  pinStdout(t, { columns: 80 });
  const turn = startTurn(t, cleanupStack(t));

  turn.type('small draft', {});
  assert.doesNotMatch(stripAnsi(turn.out.text()), /queued draft:/, 'no counter for a short draft');

  // Push the draft just past the 80% mark and repaint.
  turn.type('x'.repeat(Math.floor(MAX * 0.8) + 1 - 'small draft'.length), {});
  const frame = stripAnsi(turn.out.text());
  assert.match(frame, /queued draft: /, 'the counter appears once the draft passes 80%');
  assert.match(frame, new RegExp(`/${MAX / 1000}k`), 'the cap is shown alongside the size');
});

// ── AC-06: the preview never implies completeness ───────────────────────────

test('the queue preview marks a truncated line with (+N chars)', () => {
  const long = 'y'.repeat(1200);
  const marked = formatQueuePreview(long);
  assert.ok(marked.endsWith(`… (+${1200 - 90} chars)`), `expected the marker, got ${JSON.stringify(marked.slice(-30))}`);
  assert.equal(marked.replace(/….*$/, '').length, 90, 'the shown part is the 90-char preview');

  assert.equal(formatQueuePreview('short line'), 'short line', 'no marker for a short line');
  assert.equal(formatQueuePreview('multi   space\nline'), 'multi space line', 'display-only flattening');
});

// ── AC-07: pasted newlines keep landing past the old 400-char cap ───────────

test('a bracketed paste keeps every pasted line, far beyond the old cap', (t) => {
  pinStdout(t);
  const turn = startTurn(t, cleanupStack(t));
  const lines = Array.from({ length: 60 }, (_, i) => `line ${String(i).padStart(2, '0')} of the brief`);
  const payload = lines.join('\n');
  assert.ok(payload.length > 400, `fixture exceeds the old cap (${payload.length} chars)`);

  turn.type(undefined, { name: 'paste-start' });
  for (const [index, line] of lines.entries()) {
    turn.type(line, {});
    if (index < lines.length - 1) turn.type('', { name: 'return' });
  }
  turn.type(undefined, { name: 'paste-end' });
  turn.type('', { name: 'return' });

  assert.equal(turn.queued.length, 1);
  assert.equal(turn.queued[0], payload, 'every pasted line survived, with its newlines');
  assert.equal(count(turn.queued[0], '\n'), lines.length - 1, 'no pasted newline was lost');
});

test('newlines keep landing after the cap is reached', (t) => {
  pinStdout(t);
  const turn = startTurn(t, cleanupStack(t));
  turn.type('N'.repeat(MAX), {}); // exactly at the cap
  turn.type(undefined, { name: 'paste-start' });
  turn.type('after\n', {});
  turn.type('more\n', {});
  turn.type(undefined, { name: 'paste-end' });
  turn.type('', { name: 'return' });

  const queued = turn.queued[0];
  assert.equal(queued.length, MAX);
  assert.ok(queued.includes('\n'), 'pasted newlines still land at the cap');
  assert.ok(queued.endsWith('after\nmore\n'), 'the newest pasted text is at the tail');
});

// ── boundDraft unit coverage ────────────────────────────────────────────────

test('boundDraft keeps the newest characters and moves the cursor with them', () => {
  const under = boundDraft('abc', 2);
  assert.deepEqual(under, { value: 'abc', cursor: 2, dropped: 0 });

  const over = boundDraft('x'.repeat(MAX + 10), MAX + 10);
  assert.equal(over.value.length, MAX);
  assert.equal(over.dropped, 10);
  assert.equal(over.cursor, MAX, 'the cursor stayed on the same character');

  const cursorInsideDropped = boundDraft('y'.repeat(MAX + 10), 3);
  assert.equal(cursorInsideDropped.cursor, 0, 'a cursor inside the dropped head clamps to the start');

  assert.equal(boundDraft('', 0).value, '', 'empty input is safe');
  assert.equal(boundDraft(undefined, 0).value, '');
});

// ── regression: the idle prompt is untouched by this cap ────────────────────

test('an 8.7 KB paste into the IDLE prompt still reaches the agent whole', async (t) => {
  const register = cleanupStack(t);
  pinStdout(t, { columns: 80 });
  const stdin = new PassThrough();
  stdin.isTTY = true;
  stdin.isRaw = false;
  stdin.setRawMode = () => {};
  register(swapStdin(stdin));
  const out = captureStdout(register);
  register(() => stdin.destroy());

  const submitted = [];
  persistentPromptInput({ onSubmit: (line) => { submitted.push(line); return 'next'; } });

  // Exactly the paste size reported in the brief (8 681 chars, from the real
  // session file), so the fixture is a concrete regression anchor.
  const payload = 'word '.repeat(Math.ceil(8681 / 5)).slice(0, 8681);
  assert.equal(payload.length, 8681, 'fixture matches the reported paste size');

  stdin.emit('keypress', undefined, { name: 'paste-start' });
  for (const chunk of payload.match(/[\s\S]{1,500}/g)) stdin.emit('keypress', chunk, {});
  stdin.emit('keypress', undefined, { name: 'paste-end' });
  stdin.emit('keypress', '', { name: 'return' });

  assert.equal(submitted.length, 1, 'the idle draft submitted');
  assert.equal(submitted[0].length, 8681, 'the whole paste reached the agent (no cap on the idle prompt)');
  assert.ok(!out.text().includes('queued draft reached'), 'the idle prompt never prints the active-turn notice');
});