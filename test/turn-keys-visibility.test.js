// turn-keys-visibility.test.js — verifies the full prompt frame stays visible
// while stdout is being written to by the agent (spec
// 2026-09-01-turn-interrupt-queue follow-up).
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import { listenTurnKeys } from '../src/ui/turn-keys.js';

function fakeStdin() {
  const ee = new EventEmitter();
  ee.setRawMode = () => ee;
  ee.resume = () => ee;
  ee.pause = () => ee;
  ee.isTTY = true;
  ee.isRaw = false;
  return ee;
}

function createTerminalEmulator(columns = 80) {
  const state = { lines: [''], row: 0, col: 0, saved: null, columns };

  function ensureRow(row) {
    while (state.lines.length <= row) state.lines.push('');
  }

  function apply(chunk) {
    let index = 0;
    while (index < chunk.length) {
      if (chunk.startsWith('\x1B7', index)) {
        state.saved = { row: state.row, col: state.col };
        index += 2;
        continue;
      }
      if (chunk.startsWith('\x1B8', index)) {
        if (state.saved) ({ row: state.row, col: state.col } = state.saved);
        index += 2;
        continue;
      }
      if (chunk[index] === '\x1B') {
        const match = /^\x1B\[([0-9;]*)([A-Za-z])/.exec(chunk.slice(index));
        if (match) {
          const amount = Number(match[1]) || 0;
          if (match[2] === 'A') state.row = Math.max(0, state.row - amount);
          else if (match[2] === 'B') { state.row += amount; ensureRow(state.row); }
          else if (match[2] === 'C') state.col += amount;
          else if (match[2] === 'K') {
            ensureRow(state.row);
            state.lines[state.row] = match[1] === '2' ? '' : state.lines[state.row].slice(0, state.col);
          } else if (match[2] === 'J' && (match[1] === '0' || match[1] === '')) {
            ensureRow(state.row);
            state.lines[state.row] = state.lines[state.row].slice(0, state.col);
            state.lines.length = state.row + 1;
          }
          index += match[0].length;
          continue;
        }
        index++;
        continue;
      }
      if (chunk[index] === '\r') { state.col = 0; index++; continue; }
      if (chunk[index] === '\n') {
        state.row++;
        ensureRow(state.row);
        index++;
        continue;
      }
      ensureRow(state.row);
      if (state.col < columns) {
        const line = state.lines[state.row].padEnd(state.col);
        state.lines[state.row] = line.slice(0, state.col) + chunk[index] + line.slice(state.col + 1);
      }
      state.col++;
      index++;
    }
  }

  return {
    apply,
    get row() { return state.row; },
    get col() { return state.col; },
    get lines() { return state.lines.slice(); },
  };
}

function captureStdout(emulator = null) {
  const writes = [];
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => {
    const text = String(chunk);
    writes.push(text);
    emulator?.apply(text);
    return true;
  };
  return {
    writes,
    restore() { process.stdout.write = orig; },
    text: () => writes.join(''),
  };
}

function swapStdin(stub) {
  const original = process.stdin;
  Object.defineProperty(process, 'stdin', { value: stub, configurable: true, writable: true });
  return () => {
    Object.defineProperty(process, 'stdin', { value: original, configurable: true, writable: true });
  };
}

function stripTerminalCodes(value) {
  return value
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    .replace(/\x1b7/g, '')
    .replace(/\x1b8/g, '');
}

function lastDraw(text) {
  const start = text.lastIndexOf('\x1B7');
  return stripTerminalCodes(start >= 0 ? text.slice(start) : text);
}

test('the standard full prompt frame is drawn during the turn and survives agent writes', () => {
  const stdin = fakeStdin();
  const restoreStdin = swapStdin(stdin);
  const previousIsTTY = process.stdout.isTTY;
  process.stdout.isTTY = true;

  const terminal = createTerminalEmulator();
  const out = captureStdout(terminal);
  try {
    const keys = listenTurnKeys({
      control: { requestStop() {} },
      onLine: () => {},
      promptOptions: {
        stats: { contextLimit: 1000000, estimatedContextTokens: 9400 },
        mcpInfo: '1/1 (13 tools)',
      },
    });
    const initial = stripTerminalCodes(out.text());
    assert.match(initial, /Enter prompt or \/help/);
    assert.match(initial, /─{10,}/, 'the standard bordered frame is visible');
    assert.match(initial, /MCP: 1\/1 \(13 tools\)/, 'the standard footer is visible');
    assert.doesNotMatch(initial, /type a message and press Enter to queue/);
    assert.equal(out.text().endsWith('\x1B8'), false, 'the real cursor stays in the prompt instead of returning to the spinner');

    // The agent writes several lines; the cursor moves down on the terminal.
    process.stdout.write('agent line one\n');
    process.stdout.write('agent line two\n');
    process.stdout.write('agent line three\n');
    assert.ok(
      (out.text().match(/Enter prompt or \/help/g) || []).length >= 4,
      'every agent write redraws the intact prompt without waiting for a keypress',
    );

    // The user types "abc"; the input row must show it without disturbing
    // the agent output above.
    for (const ch of 'abc') stdin.emit('keypress', ch, { name: ch });
    const after = out.text();
    // Strip ANSI escape codes before matching so the assertion is not
    // sensitive to palette specifics.
    const stripped = stripTerminalCodes(after);
    assert.match(stripped, /❯\s+abc/);
    assert.match(stripped, /agent line one/);
    assert.match(stripped, /agent line two/);
    assert.match(stripped, /agent line three/);

    const visibleDraftRows = terminal.lines
      .map((line, row) => ({ line, row }))
      .filter(({ line }) => /❯\s+/.test(line));
    assert.equal(visibleDraftRows.length, 1, 'only the latest draft row remains on screen');
    assert.match(visibleDraftRows[0].line, /❯\s+abc/, 'the active draft is not progressively erased');
    assert.equal(terminal.row, visibleDraftRows[0].row, 'the real terminal cursor is on the draft row');
    assert.equal(
      terminal.col,
      visibleDraftRows[0].line.indexOf('abc') + 3,
      'the blinking cursor is immediately after the typed draft',
    );

    keys.stop();
  } finally {
    out.restore();
    process.stdout.isTTY = previousIsTTY;
    restoreStdin();
  }
});

test('enter commits the line to onLine and restores the standard placeholder', () => {
  const stdin = fakeStdin();
  const restoreStdin = swapStdin(stdin);
  const previousIsTTY = process.stdout.isTTY;
  process.stdout.isTTY = true;

  const out = captureStdout();
  const captured = [];
  try {
    listenTurnKeys({ control: { requestStop() {} }, onLine: (line) => captured.push(line) });
    for (const ch of 'hello world') stdin.emit('keypress', ch, { name: ch });
    stdin.emit('keypress', '', { name: 'return' });
    assert.deepEqual(captured, ['hello world']);
    assert.match(out.text(), /Enter prompt or \/help/);
  } finally {
    out.restore();
    process.stdout.isTTY = previousIsTTY;
    restoreStdin();
  }
});

test('active-turn autocomplete uses a distinct marker and Tab completes it', () => {
  const stdin = fakeStdin();
  const restoreStdin = swapStdin(stdin);
  const previousIsTTY = process.stdout.isTTY;
  process.stdout.isTTY = true;

  const out = captureStdout();
  const captured = [];
  try {
    const keys = listenTurnKeys({ control: { requestStop() {} }, onLine: (line) => captured.push(line) });
    for (const ch of '/sw') stdin.emit('keypress', ch, { name: ch });

    let frame = lastDraw(out.text());
    assert.match(frame, /●\s+\/switch/, 'the selected match is visually a menu item');
    assert.equal((frame.match(/❯/g) || []).length, 1, 'only the real input row uses the prompt glyph');

    stdin.emit('keypress', '', { name: 'tab' });
    frame = lastDraw(out.text());
    assert.match(frame, /❯\s+\/switch/, 'Tab fills the highlighted command');
    stdin.emit('keypress', '', { name: 'return' });
    assert.deepEqual(captured, ['/switch']);
    keys.stop();
  } finally {
    out.restore();
    process.stdout.isTTY = previousIsTTY;
    restoreStdin();
  }
});

test('backspace and ctrl+u edit the buffered line', () => {
  const stdin = fakeStdin();
  const restoreStdin = swapStdin(stdin);
  const previousIsTTY = process.stdout.isTTY;
  process.stdout.isTTY = true;

  const out = captureStdout();
  const captured = [];
  try {
    listenTurnKeys({ control: { requestStop() {} }, onLine: (line) => captured.push(line) });
    for (const ch of 'hello') stdin.emit('keypress', ch, { name: ch });
    stdin.emit('keypress', '', { name: 'backspace' });
    stdin.emit('keypress', '', { name: 'backspace' });
    stdin.emit('keypress', 'p', { name: 'p' });
    stdin.emit('keypress', '', { name: 'return' });
    assert.deepEqual(captured, ['help']);
  } finally {
    out.restore();
    process.stdout.isTTY = previousIsTTY;
    restoreStdin();
  }
});
