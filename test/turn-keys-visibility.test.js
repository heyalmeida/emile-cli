// turn-keys-visibility.test.js — verifies the live input row stays visible
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

function captureStdout() {
  const writes = [];
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => {
    writes.push(String(chunk));
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

test('the live input row is drawn on every keypress and survives agent writes', () => {
  const stdin = fakeStdin();
  const restoreStdin = swapStdin(stdin);
  const previousIsTTY = process.stdout.isTTY;
  process.stdout.isTTY = true;

  const out = captureStdout();
  try {
    const keys = listenTurnKeys({ control: { requestStop() {} }, onLine: () => {} });
    const initial = out.text();
    assert.match(initial, /type a message and press Enter to queue/);

    // The agent writes several lines; the cursor moves down on the terminal.
    process.stdout.write('agent line one\n');
    process.stdout.write('agent line two\n');
    process.stdout.write('agent line three\n');

    // The user types "abc"; the input row must show it without disturbing
    // the agent output above.
    for (const ch of 'abc') stdin.emit('keypress', ch, { name: ch });
    const after = out.text();
    // Strip ANSI escape codes before matching so the assertion is not
    // sensitive to palette specifics.
    const stripped = after.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/\x1b7/g, '').replace(/\x1b8/g, '');
    assert.match(stripped, /❯ abc/);
    assert.match(stripped, /agent line one/);
    assert.match(stripped, /agent line two/);
    assert.match(stripped, /agent line three/);

    keys.stop();
  } finally {
    out.restore();
    process.stdout.isTTY = previousIsTTY;
    restoreStdin();
  }
});

test('enter commits the line to onLine and clears the buffer', () => {
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
    assert.match(out.text(), /type a message and press Enter to queue/);
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
