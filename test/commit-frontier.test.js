// commit-frontier.test.js — the print-once rule for finalized output
// (specs/2026-10-10-ui-commit-frontier, deep-dive P1-14 Stage A).
//
// The duplication family (thinking § 7.2, large paste § 22.2, the partial
// "prompt cortado" frame) all came from repainting a mutable block whose top had
// scrolled out of cursor-up reach. The frontier removes the class: a finalized
// block is written once, a failed write leaves it uncommitted for the next
// frame to retry, and the module never erases anything — rows that no longer fit
// the live region are released to the terminal, which scrolls them away.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SYNCHRONIZED_BEGIN,
  SYNCHRONIZED_END,
  createFrontier,
  shouldEmitSynchronizedOutput,
  wrapSynchronizedOutput,
} from '../src/ui/commit-frontier.js';

/** Capture sink: records every chunk and can be made to fail. */
function capture() {
  const writes = [];
  let failures = 0;
  return {
    writes,
    text: () => writes.join(''),
    failNext(times = 1) { failures = times; },
    write(chunk) {
      if (failures > 0) {
        failures -= 1;
        throw new Error('EIO: terminal gone');
      }
      writes.push(String(chunk));
      return true;
    },
  };
}

/** A TTY without tmux — the only configuration that emits the wrapper. */
const tty = { env: {}, isTTY: true };

test('a block is committed with a trailing newline and written exactly once', () => {
  const sink = capture();
  const frontier = createFrontier({ write: sink.write, rows: 40, ...tty });

  assert.equal(frontier.commit({ id: 'reply-1', text: '  ╭─ emile ─\n  hello' }), true);
  assert.deepEqual(
    sink.writes,
    [`${SYNCHRONIZED_BEGIN}  ╭─ emile ─\n  hello\n${SYNCHRONIZED_END}`],
    'one write, closed by a newline',
  );
  assert.equal(frontier.isCommitted('reply-1'), true);
  assert.equal(frontier.pendingCount(), 0);
});

test('a committed block is never re-emitted (print-once)', () => {
  const sink = capture();
  const frontier = createFrontier({ write: sink.write, rows: 40, ...tty });

  frontier.commit({ id: 'tools-1', text: '  ● read   a.js\n  ● edit   b.js' });
  const afterFirst = sink.writes.length;

  // A caller that repaints its frame, a retry, a replayed turn: any number of
  // further commits of the same block must add nothing to the stream.
  for (let i = 0; i < 5; i += 1) {
    assert.equal(frontier.commit({ id: 'tools-1', text: '  ● read   a.js\n  ● edit   b.js' }), true);
  }

  assert.equal(sink.writes.length, afterFirst, 'the block reached the terminal exactly once');
  assert.equal(sink.text().split('● read').length - 1, 1);
});

test('distinct ids are both emitted, in commit order', () => {
  const sink = capture();
  const frontier = createFrontier({ write: sink.write, rows: 40, ...tty });

  frontier.commit({ id: 'a', text: 'first' });
  frontier.commit({ id: 'b', text: 'second' });

  assert.deepEqual(sink.writes, ['first\n', 'second\n']);
});

test('a failed write leaves the block uncommitted and the next commit retries it', () => {
  const sink = capture();
  const frontier = createFrontier({ write: sink.write, rows: 40, ...tty });

  sink.failNext();
  assert.equal(frontier.commit({ id: 'reply-9', text: 'final answer' }), false, 'the failed write reports failure');
  assert.equal(frontier.isCommitted('reply-9'), false, 'print-once can never mark an unprinted block');
  assert.equal(frontier.pendingCount(), 1, 'the block stays queued for the next frame');

  assert.equal(frontier.commit({ id: 'reply-10', text: 'next block' }), true);
  assert.equal(sink.text().split('final answer').length - 1, 1, 'the retry emitted it exactly once');
  assert.equal(frontier.isCommitted('reply-9'), true);
  assert.equal(frontier.pendingCount(), 0);
  assert.deepEqual(sink.writes, ['final answer\n', 'next block\n'], 'the retry keeps commit order');
});

test('a retry of the failing id does not double-print the queued copy', () => {
  const sink = capture();
  const frontier = createFrontier({ write: sink.write, rows: 40, ...tty });

  sink.failNext();
  frontier.commit({ id: 'x', text: 'once' });
  assert.equal(frontier.pendingCount(), 1);

  assert.equal(frontier.commit({ id: 'x', text: 'once' }), true);
  assert.equal(sink.writes.length, 1, 'one successful write, not two');
});

test('a failing sink blocks the queue without losing the order', () => {
  const sink = capture();
  const frontier = createFrontier({ write: sink.write, rows: 40, ...tty });

  sink.failNext(3);
  frontier.commit({ id: 'a', text: 'a' }); // fails, queued
  frontier.commit({ id: 'b', text: 'b' }); // retries a (fails again), then fails
  assert.equal(frontier.pendingCount(), 2);
  assert.deepEqual(sink.writes, []);

  frontier.commit({ id: 'c', text: 'c' });
  assert.deepEqual(sink.writes, ['a\n', 'b\n', 'c\n'], 'all three land in order once the sink recovers');
  assert.equal(frontier.pendingCount(), 0);
});

test('overflow is released to the terminal, never erased', () => {
  const sink = capture();
  const frontier = createFrontier({ write: sink.write, rows: 4, ...tty });

  frontier.commit({ id: 'tall', text: 'r1\nr2\nr3\nr4\nr5' });

  assert.equal(frontier.liveRows(), 3, 'the live region holds rows - 1 = 3 rows');
  assert.equal(frontier.releasedRows(), 2, 'the two rows above it went to the scrollback');
  assert.equal(sink.text().split('\n').length - 1, 5, 'every row still reached the terminal');
  assert.doesNotMatch(sink.text(), /\x1B\[\d*[JKA]/, 'the frontier never erases and never climbs');
});

test('rows is read per commit, so a resize is honoured immediately', () => {
  const sink = capture();
  let height = 40;
  const frontier = createFrontier({ write: sink.write, rows: () => height, ...tty });

  frontier.commit({ id: 'a', text: 'one row' });
  assert.equal(frontier.releasedRows(), 0, '5-row content fits a 40-row terminal');

  height = 2;
  frontier.commit({ id: 'b', text: 'another row' });
  assert.equal(frontier.liveRows(), 1, 'the live region shrank with the terminal');
  assert.equal(frontier.releasedRows(), 1, 'what no longer fits is released, not clipped back');
});

test('a missing or absurd rows value falls back to the documented viewport', () => {
  const sink = capture();
  for (const rows of [undefined, 0, -5, Number.NaN]) {
    const frontier = createFrontier({ write: sink.write, rows, ...tty });
    frontier.commit({ id: `a-${String(rows)}`, text: 'row' });
    assert.equal(frontier.liveRows(), 1, `the 24-row default keeps the single row live (rows=${String(rows)})`);
  }
});

test('multi-row blocks are wrapped in synchronized output on a TTY', () => {
  const sink = capture();
  const frontier = createFrontier({ write: sink.write, rows: 40, ...tty });

  frontier.commit({ id: 'box', text: '  ╭─ emile ─\n  body\n  ╰────────' });

  assert.equal(sink.writes.length, 1, 'the whole frame is one atomic write');
  assert.ok(sink.writes[0].startsWith(SYNCHRONIZED_BEGIN), 'BEGIN first');
  assert.ok(sink.writes[0].endsWith(`${SYNCHRONIZED_END}`), 'END last');
  assert.equal(sink.writes[0].split(SYNCHRONIZED_BEGIN).length - 1, 1);
  assert.equal(sink.writes[0].split(SYNCHRONIZED_END).length - 1, 1);
});

test('a single-row block is not wrapped, and tmux or a pipe suppresses the wrapper', () => {
  const oneRow = capture();
  createFrontier({ write: oneRow.write, rows: 40, ...tty }).commit({ id: 'a', text: 'one row' });
  assert.equal(oneRow.text(), 'one row\n', 'a one-row write needs no wrapper');

  const multiRow = 'a\nb';
  const tmux = capture();
  createFrontier({ write: tmux.write, rows: 40, env: { TMUX: '/tmp/tmux-1000/default,123,0' }, isTTY: true })
    .commit({ id: 'b', text: multiRow });
  assert.equal(tmux.text(), 'a\nb\n', 'tmux repaints the pane itself — no wrapper');

  const pipe = capture();
  createFrontier({ write: pipe.write, rows: 40, env: {}, isTTY: false })
    .commit({ id: 'c', text: multiRow });
  assert.equal(pipe.text(), 'a\nb\n', 'a piped stdout stays byte-clean');
});

test('shouldEmitSynchronizedOutput follows the reference tmux exception', () => {
  assert.equal(shouldEmitSynchronizedOutput({ env: {}, isTTY: true }), true);
  assert.equal(shouldEmitSynchronizedOutput({ env: { TMUX: 'x' }, isTTY: true }), false);
  assert.equal(shouldEmitSynchronizedOutput({ env: {}, isTTY: false }), false);
  assert.equal(wrapSynchronizedOutput('body', { env: {}, isTTY: true }), `${SYNCHRONIZED_BEGIN}body${SYNCHRONIZED_END}`);
  assert.equal(wrapSynchronizedOutput('body', { env: { TMUX: 'x' }, isTTY: true }), 'body');
});

test('a block without an id is still written through the same discipline', () => {
  const sink = capture();
  const frontier = createFrontier({ write: sink.write, rows: 40, ...tty });

  assert.equal(frontier.commit('bare string'), true);
  assert.equal(frontier.commit('bare string'), true, 'nothing to dedupe without an id');
  assert.equal(sink.text(), 'bare string\nbare string\n', 'a replay of identical content is allowed');
});

test('an empty block commits nothing and consumes no rows', () => {
  const sink = capture();
  const frontier = createFrontier({ write: sink.write, rows: 40, ...tty });

  assert.equal(frontier.commit({ id: 'empty', text: '' }), true);
  assert.deepEqual(sink.writes, [], 'no write for an empty block');
  assert.equal(frontier.liveRows(), 0);
  assert.equal(frontier.releasedRows(), 0);
});

test('createFrontier refuses to run without an injected sink', () => {
  assert.throws(() => createFrontier({}), TypeError);
});