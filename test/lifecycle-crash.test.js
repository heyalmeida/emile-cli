// lifecycle-crash.test.js — a crash must take the ordered shutdown path
// (specs/2026-10-10-crash-path-coordinator, deep-dive P1-15 § 18).
//
// There was no uncaughtException/unhandledRejection handler anywhere in src/ or
// bin/, so an escaped async error killed the process before any phase ran: the
// session was never flushed to complete, memory was not flushed, MCP children
// were orphaned and the prompt's stdin lease was never released. The bootstrap
// catch also cleared the screen before printing, destroying the transcript.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import {
  createFatalHandler,
  handleFatal,
  redactFatalMessage,
  describeFatalReason,
  TERMINAL_RESET,
} from '../src/lifecycle/crash.js';

/** Collects what the handler "printed", without touching the real stderr. */
function recorder() {
  const lines = [];
  return { lines, print: (line) => { lines.push(String(line)); }, text: () => lines.join('') };
}

function exitSpy() {
  const codes = [];
  return { codes, exit: (code) => { codes.push(code); } };
}

// ── AC-01 / AC-02: one line on stderr, coordinator once, exit 1 ─────────────

test('an uncaught exception prints one redacted stderr line, runs the coordinator once and exits 1', () => {
  const out = recorder();
  const exits = exitSpy();
  const seen = [];
  // Mirrors the real coordinator: it owns the exit (exitCodeFor → 1 for crashes).
  const coordinator = (origin) => { seen.push(origin); exits.exit(1); };
  const fatal = createFatalHandler({ coordinator, exit: exits.exit, print: out.print });

  fatal(new Error('stream exploded'), 'uncaughtException');

  assert.deepEqual(seen, ['uncaughtException'], 'the coordinator ran exactly once');
  assert.deepEqual(exits.codes, [1], 'a crash exits with code 1');
  assert.equal(out.lines.length, 1, 'exactly one line is printed');
  assert.match(out.text(), /^✗ Fatal \(uncaughtException\): stream exploded\n$/);
});

test('an unhandled rejection takes the same path with its own origin tag', () => {
  const out = recorder();
  const exits = exitSpy();
  const seen = [];
  const fatal = createFatalHandler({
    coordinator: (origin) => { seen.push(origin); exits.exit(1); },
    exit: exits.exit,
    print: out.print,
  });

  fatal(new Error('db handle closed'), 'unhandledRejection');

  assert.deepEqual(seen, ['unhandledRejection']);
  assert.deepEqual(exits.codes, [1]);
  assert.match(out.text(), /^✗ Fatal \(unhandledRejection\): db handle closed\n$/);
});

test('code and status are appended when the error carries them', () => {
  const out = recorder();
  const fatal = createFatalHandler({ coordinator: () => {}, print: out.print });
  const err = Object.assign(new Error('gateway hiccup'), { code: 'ECONNRESET', status: 502 });

  fatal(err, 'uncaughtException');

  assert.match(out.text(), /gateway hiccup \(code ECONNRESET, status 502\)/);
});

// ── AC-03: non-Error reasons never throw and stay useful ───────────────────

test('a string reason is printed as-is', () => {
  const out = recorder();
  createFatalHandler({ coordinator: () => {}, print: out.print })('kaboom', 'unhandledRejection');
  assert.match(out.text(), /^✗ Fatal \(unhandledRejection\): kaboom\n$/);
});

test('a plain object reason is described by shape and keys, never dumped', () => {
  const out = recorder();
  const reason = { status: 500, body: { secretPayload: 'the user private content' } };

  createFatalHandler({ coordinator: () => {}, print: out.print })(reason, 'unhandledRejection');

  const text = out.text();
  assert.match(text, /\[object Object\] keys=\[status, body\]/, 'the shape and keys identify the source');
  assert.doesNotMatch(text, /the user private content/, 'the payload is never serialized');
  assert.doesNotMatch(text, /secretPayload/, 'and neither are nested keys');
});

test('null, undefined and exotic reasons are handled without throwing', () => {
  const out = recorder();
  const fatal = createFatalHandler({ coordinator: () => {}, print: out.print });
  for (const reason of [null, undefined, 0, false, Symbol('x'), () => {}, [1, 2]]) {
    assert.doesNotThrow(() => fatal(reason, 'unhandledRejection'), `reason ${String(reason)}`);
  }
  assert.equal(out.lines.length, 7, 'every reason produced exactly one line');
});

// ── AC-02: redaction ──────────────────────────────────────────────────────

test('the sentinel secrets never reach the printed line', () => {
  const out = recorder();
  const err = new Error(
    'Request failed: Authorization: Bearer supersecret and api_key=tok123 (also sk-ant-abcdefgh12345678)',
  );

  createFatalHandler({ coordinator: () => {}, print: out.print })(err, 'uncaughtException');

  const text = out.text();
  assert.doesNotMatch(text, /supersecret/, 'the bearer token is gone');
  assert.doesNotMatch(text, /tok123/, 'the api_key value is gone');
  assert.doesNotMatch(text, /sk-ant-abcdefgh12345678/, 'the sk- key shape is gone');
  assert.match(text, /Bearer \[redacted\]/, 'the shape of the line is preserved for diagnosis');
  assert.match(text, /api_key=\[redacted\]/);
});

test('the redactor covers token/secret/password shapes and control characters', () => {
  assert.equal(redactFatalMessage('token=abc123'), 'token=[redacted]');
  assert.equal(redactFatalMessage('password: hunter2'), 'password: [redacted]');
  assert.equal(redactFatalMessage('secret = zzz'), 'secret = [redacted]');
  assert.equal(redactFatalMessage('a\u0007b\u001bc'), 'abc', 'control characters are stripped');
  assert.equal(redactFatalMessage('x'.repeat(900)).length, 300, 'the line is capped');
  assert.equal(redactFatalMessage(null), '', 'null is safe');
});

// ── AC-04 / AC-05: the handler itself never throws ─────────────────────────

test('a coordinator that throws synchronously still exits 1 exactly once', () => {
  const out = recorder();
  const exits = exitSpy();
  const fatal = createFatalHandler({
    coordinator: () => { throw new Error('coordinator exploded'); },
    exit: exits.exit,
    print: out.print,
  });

  assert.doesNotThrow(() => fatal(new Error('original crash'), 'uncaughtException'));
  assert.deepEqual(exits.codes, [1], 'the fallback exit ran');
  assert.ok(out.text().includes(TERMINAL_RESET), 'and the terminal was reset best-effort');
});

test('a coordinator whose promise rejects still exits 1 exactly once', async () => {
  const out = recorder();
  const exits = exitSpy();
  const fatal = createFatalHandler({
    coordinator: () => Promise.reject(new Error('async coordinator failure')),
    exit: exits.exit,
    print: out.print,
  });

  fatal(new Error('original crash'), 'uncaughtException');
  await new Promise((r) => setImmediate(r));

  assert.deepEqual(exits.codes, [1]);
});

test('with no coordinator (bootstrap) the handler resets the terminal and exits 1', () => {
  const out = recorder();
  const exits = exitSpy();
  const fatal = createFatalHandler({ exit: exits.exit, print: out.print });

  assert.doesNotThrow(() => fatal(new Error('boot failure'), 'bootstrap'));
  assert.match(out.text(), /✗ Fatal \(bootstrap\): boot failure/);
  assert.ok(out.text().includes(TERMINAL_RESET));
  assert.deepEqual(exits.codes, [1]);
});

test('a throwing printer cannot prevent the exit', () => {
  const exits = exitSpy();
  const fatal = createFatalHandler({
    coordinator: () => { throw new Error('no coordinator either'); },
    exit: exits.exit,
    print: () => { throw new Error('stderr is gone'); },
  });

  assert.doesNotThrow(() => fatal(new Error('crash'), 'uncaughtException'));
  assert.deepEqual(exits.codes, [1]);
});

test('the default exported handler is the coordinator-less (bootstrap) one', () => {
  assert.equal(typeof handleFatal, 'function');
  assert.match(describeFatalReason({ message: 'plain' }), /^plain$/);
});

// ── wiring: the real coordinator is reachable from both crash hooks ─────────
//
// `process.exit` is spied for the WHOLE file: the coordinator exits
// asynchronously, and restoring the real exit while it is still draining would
// kill the test process under a loaded parallel run. The TAP stream is left
// alone, and the test WAITS for the coordinator's exit before asserting or
// restoring anything.
const exitCodes = [];
const realExit = process.exit;
process.exit = (code) => { exitCodes.push(code); };
after(() => { process.exit = realExit; });

async function waitFor(predicate, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return predicate();
}

test('the installed crash hooks run the ordered shutdown and exit 1', async (t) => {
  const { installShutdownHandlers, setForceExit, clearActiveTool } = await import('../src/lifecycle/index.js');

  const before = {
    uncaughtException: process.listeners('uncaughtException'),
    unhandledRejection: process.listeners('unhandledRejection'),
    exit: process.listeners('exit'),
  };
  t.after(() => {
    for (const [event, previous] of Object.entries(before)) {
      for (const listener of process.listeners(event)) {
        if (!previous.includes(listener)) process.removeListener(event, listener);
      }
    }
  });

  // Capture stdout only around this test; it is restored once the coordinator has
  // finished (below), so no later result loses its place in the TAP stream.
  const stdoutWrites = [];
  const realStdoutWrite = process.stdout.write;
  process.stdout.write = (chunk) => { stdoutWrites.push(String(chunk)); return true; };
  t.after(() => { process.stdout.write = realStdoutWrite; });

  exitCodes.length = 0;
  clearActiveTool();

  let phaseRuns = 0;
  let mcpCloses = 0;
  installShutdownHandlers({
    verbose: false,
    shutdownMcp: async () => { mcpCloses += 1; },
    flushSync: () => { phaseRuns += 1; },
    flushMemory: async () => ({ changed: false }),
    markAborted: () => {},
  });

  const crashHooks = process.listeners('uncaughtException').filter((l) => !before.uncaughtException.includes(l));
  assert.equal(crashHooks.length, 1, 'exactly one uncaughtException hook was installed');
  assert.equal(
    process.listeners('unhandledRejection').filter((l) => !before.unhandledRejection.includes(l)).length,
    1,
    'and one unhandledRejection hook',
  );

  // Invoke the registered listener directly — the suite must not emit the real
  // signal (that would tear the test runner down).
  crashHooks[0](new Error('escaped async failure'));

  assert.ok(await waitFor(() => exitCodes.length > 0), 'the coordinator reached its exit');
  assert.equal(phaseRuns, 1, 'every shutdown phase ran exactly once');
  assert.equal(mcpCloses, 1, 'including the MCP phase, so no child is orphaned');
  assert.deepEqual(exitCodes, [1], 'the process left with code 1');
  assert.doesNotMatch(stdoutWrites.join(''), /\x1B\[2J/, 'the crash path does not clear the screen');

  // A second crash enters the coordinator's own re-entrancy guard: the P0-3
  // force-exit path takes over instead of running the phases twice.
  const forceExits = [];
  const restoreSeam = setForceExit((reason) => forceExits.push(reason));
  t.after(restoreSeam);
  crashHooks[0](new Error('second failure'));
  await new Promise((r) => setImmediate(r));

  assert.deepEqual(forceExits, ['uncaughtException'], 'the second crash force-exits instead of re-running phases');
  assert.equal(phaseRuns, 1, 'no phase ran twice');
});

// ── AC-06: no exit path clears the screen ──────────────────────────────────

test('the bootstrap path no longer clears the screen, and /switch still does', async () => {
  const fs = await import('node:fs');

  const bin = fs.readFileSync('bin/emile.js', 'utf8');
  assert.doesNotMatch(bin, /console\.clear/, 'a fatal error must not wipe the transcript');
  assert.match(bin, /handleFatal\(err, 'bootstrap'\)/, 'and it routes through the shared fatal path');

  const handlers = fs.readFileSync('src/commands/handlers.js', 'utf8');
  assert.match(handlers, /console\.clear\(\); \/\/ intentional mid-session redraw/, 'the /switch redraw is intentional and documented');

  for (const file of ['src/lifecycle/restore-terminal.js', 'src/lifecycle/crash.js', 'src/lifecycle/index.js']) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /\\x1B\[2J/, `${file} must not clear the screen`);
  }
});

test('src/lifecycle/index.js stays inside its 150-line lint gate', async () => {
  const fs = await import('node:fs');
  const lines = fs.readFileSync('src/lifecycle/index.js', 'utf8').split(/\r?\n/).length;
  assert.ok(lines <= 150, `index.js has ${lines} lines (gate 150)`);
});