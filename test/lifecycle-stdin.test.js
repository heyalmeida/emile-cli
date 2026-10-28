// lifecycle-stdin.test.js — the shutdown coordinator must actually hold up its
// end of the contract (specs/2026-10-10-lifecycle-recovery-integrity, P0-3 § 18):
//
//   * phase 1 runs the REAL prompt teardown, so an idle SIGINT releases the
//     stdin lease (keypress listener removed, raw mode restored, paste off);
//   * exit never wipes the screen;
//   * a second signal forces the exit with the same code and runs no phase twice.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { installShutdownHandlers, setForceExit, clearActiveTool } from '../src/lifecycle/index.js';

// The coordinator exits asynchronously: keep the exit spy for the whole file so a
// late exit cannot kill the runner, and wait for it instead of sleeping.
const exitSpyCodes = [];
const _realExit = process.exit;
process.exit = (code) => { exitSpyCodes.push(code); };
after(() => { process.exit = _realExit; });

async function waitFor(predicate, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return predicate();
}

/** Captures stdout writes without disturbing the runner's own protocol. */
function captureStdout() {
  const writes = [];
  const original = process.stdout.write;
  process.stdout.write = (chunk) => { writes.push(String(chunk)); return true; };
  return { text: () => writes.join(''), restore: () => { process.stdout.write = original; } };
}

/** Removes only the listeners this test added; returns their count. */
function trackListeners(t) {
  const before = {
    SIGINT: process.listeners('SIGINT'),
    SIGTERM: process.listeners('SIGTERM'),
    SIGHUP: process.listeners('SIGHUP'),
    exit: process.listeners('exit'),
  };
  t.after(() => {
    for (const [event, previous] of Object.entries(before)) {
      for (const listener of process.listeners(event)) {
        if (!previous.includes(listener)) process.removeListener(event, listener);
      }
    }
  });
}

/**
 * NOTE: the coordinator's re-entrancy latch is module state, so the whole
 * first/second-signal sequence is asserted inside ONE test — a second install in
 * the same process would take the force-exit path immediately by design.
 */
test('the coordinator tears the prompt down once, keeps the screen, and a second signal forces the exit', async (t) => {
  trackListeners(t);
  const out = captureStdout();
  const exits = exitSpyCodes;
  exits.length = 0;
t.after(() => { out.restore(); });

  // Fake stdin: the teardown is expected to restore raw mode on it.
  const stdin = { isTTY: true, isRaw: true, rawModeCalls: [], setRawMode(v) { this.rawModeCalls.push(v); }, resume() {}, pause() {} };
  const originalStdin = process.stdin;
  Object.defineProperty(process, 'stdin', { value: stdin, configurable: true, writable: true });
  t.after(() => Object.defineProperty(process, 'stdin', { value: originalStdin, configurable: true, writable: true }));

  clearActiveTool(); // no tool in flight → drain-tools returns immediately

  let teardowns = 0;
  let flushSyncCalls = 0;
  let mcpCloses = 0;
  installShutdownHandlers({
    verbose: false,
    shutdownMcp: async () => { mcpCloses += 1; },
    flushSync: () => { flushSyncCalls += 1; },
    flushMemory: async () => ({ changed: false }),
    markAborted: () => {},
    // Stands in for the live prompt: releasing the lease means restoring the
    // incoming raw mode (exactly what the real teardown does).
    shutdownPrompt: () => { teardowns += 1; stdin.setRawMode(false); },
  });

  // ── first signal: phases run, then the coordinator exits 130 ──────────────
  process.emit('SIGINT');
assert.ok(await waitFor(() => exits.length > 0), "the coordinator reached its exit");

  assert.equal(teardowns, 1, 'phase 1 ran the injected prompt teardown exactly once');
  assert.deepEqual(stdin.rawModeCalls, [false], 'the teardown restored raw mode on stdin');
  assert.equal(flushSyncCalls, 1, 'the flush phase ran');
  assert.equal(mcpCloses, 1, 'the MCP phase ran');
  assert.deepEqual(exits, [130], 'SIGINT maps to exit code 130');
  assert.doesNotMatch(out.text(), /\x1B\[2J/, 'the terminal is never cleared');
  assert.doesNotMatch(out.text(), /\x1B\[H/, 'the cursor is never homed');
  assert.match(out.text(), /\x1B\[\?2004l/, 'bracketed paste is disabled');

  // ── second signal: force-exit with the SAME code, no phase re-runs ────────
  const forceExits = [];
  const restoreSeam = setForceExit((reason) => forceExits.push(reason));
  t.after(restoreSeam);
  process.emit('SIGINT');
  await new Promise((r) => setImmediate(r));

  assert.deepEqual(forceExits, ['SIGINT'], 'the re-entrant path went through the force-exit seam');
  assert.equal(teardowns, 1, 'no phase ran a second time');
  assert.equal(flushSyncCalls, 1, 'nor did the flush phase');
  assert.equal(mcpCloses, 1, 'nor did the MCP phase');
});

// ── the prompt's own teardown, exposed through the onReady handle ───────────

test('the persistent prompt exposes a shutdown that releases the stdin lease', async (t) => {
  const { EventEmitter } = await import('node:events');
  const { persistentPromptInput } = await import('../src/ui/prompt-input-persistent.js');

  const out = captureStdout();
  const stdin = new EventEmitter();
  stdin.isTTY = true;
  stdin.isRaw = false; // the shell's value before the prompt takes over
  stdin.rawModeCalls = [];
  stdin.setRawMode = (v) => { stdin.rawModeCalls.push(v); };
  stdin.resume = () => {};
  stdin.pause = () => {};
  const originalStdin = process.stdin;
  Object.defineProperty(process, 'stdin', { value: stdin, configurable: true, writable: true });
  const saved = {};
  for (const [k, v] of Object.entries({ columns: 80, rows: 40, isTTY: true })) {
    saved[k] = Object.getOwnPropertyDescriptor(process.stdout, k);
    Object.defineProperty(process.stdout, k, { value: v, configurable: true, writable: true });
  }
  t.after(() => {
    out.restore();
    Object.defineProperty(process, 'stdin', { value: originalStdin, configurable: true, writable: true });
    for (const [k, d] of Object.entries(saved)) {
      if (d) Object.defineProperty(process.stdout, k, d);
      else Object.defineProperty(process.stdout, k, { value: undefined, configurable: true, writable: true });
    }
  });

  let ready = null;
  const settled = persistentPromptInput({ onSubmit: () => 'next', onReady: (api) => { ready = api; } });

  assert.equal(typeof ready?.shutdown, 'function', 'the handle exposes shutdown');
  assert.equal(typeof ready.redraw, 'function', 'and keeps the existing methods');
  assert.equal(stdin.listenerCount('keypress'), 1, 'the prompt owns stdin while idle');

  ready.shutdown();

  assert.equal(stdin.listenerCount('keypress'), 0, 'the keypress listener was removed');
  assert.equal(stdin.rawModeCalls.at(-1), false, 'raw mode is restored to the incoming value');
  assert.ok(stdin.rawModeCalls.includes(true), 'and it had been enabled while the prompt owned stdin');
  assert.ok(out.text().includes('\x1B[?2004l'), 'bracketed paste is disabled on teardown');
  await settled; // the pending prompt promise resolves, so the REPL can move on

  // Idempotent: the coordinator may call it while its own Ctrl+C path already did.
  const callsAfterShutdown = stdin.rawModeCalls.length;
  ready.shutdown();
  assert.equal(stdin.rawModeCalls.length, callsAfterShutdown, 'a second teardown is a no-op');
});

// ── exit paths must not clear the screen (source-level guard) ───────────────

test('no exit path emits a screen clear', async () => {
  const fs = await import('node:fs');
  for (const file of ['src/lifecycle/restore-terminal.js', 'src/cli.js']) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /\\x1B\[2J/, `${file} must not clear the screen on exit`);
    assert.doesNotMatch(source, /\\x1B\[H/, `${file} must not home the cursor on exit`);
    assert.doesNotMatch(source, /\bclear\(\)/, `${file} must not call console.clear on exit`);
  }
});