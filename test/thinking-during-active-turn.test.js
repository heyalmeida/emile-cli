// thinking-during-active-turn.test.js — the live thinking stream must
// remain visible while listenTurnKeys is arbitrating stdout
// (spec 2026-09-02-thinking-during-active-turn).
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import { listenTurnKeys } from '../src/ui/turn-keys.js';
import { runAgent } from '../src/agent/agent.js';

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
  function ensureRow(row) { while (state.lines.length <= row) state.lines.push(''); }
  function apply(chunk) {
    let index = 0;
    while (index < chunk.length) {
      if (chunk.startsWith('\x1B7', index)) { state.saved = { row: state.row, col: state.col }; index += 2; continue; }
      if (chunk.startsWith('\x1B8', index)) { if (state.saved) ({ row: state.row, col: state.col } = state.saved); index += 2; continue; }
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
      if (chunk[index] === '\n') { state.row++; ensureRow(state.row); index++; continue; }
      ensureRow(state.row);
      if (state.col < columns) {
        const line = state.lines[state.row].padEnd(state.col);
        state.lines[state.row] = line.slice(0, state.col) + chunk[index] + line.slice(state.col + 1);
      }
      state.col++;
      index++;
    }
  }
  return { apply, get row() { return state.row; }, get col() { return state.col; }, get lines() { return state.lines.slice(); } };
}

function captureStdout(emulator) {
  const writes = [];
  const snapshots = [];
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => {
    const text = String(chunk);
    writes.push(text);
    emulator?.apply(text);
    if (emulator) snapshots.push(emulator.lines.map((l) => l.replace(/\s+$/, '')));
    return true;
  };
  return { writes, snapshots, restore() { process.stdout.write = orig; }, text: () => writes.join('') };
}

function swapStdin(stub) {
  const original = process.stdin;
  Object.defineProperty(process, 'stdin', { value: stub, configurable: true, writable: true });
  return () => { Object.defineProperty(process, 'stdin', { value: original, configurable: true, writable: true }); };
}

function stripTerminalCodes(value) {
  return value.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/\x1b7/g, '').replace(/\x1b8/g, '');
}

test('thinking stream rows survive the active-turn prompt arbitration', async () => {
  const stdin = fakeStdin();
  const restoreStdin = swapStdin(stdin);
  const previousIsTTY = process.stdout.isTTY;
  process.stdout.isTTY = true;
  const previousColumns = process.stdout.columns;
  process.stdout.columns = 80;

  const terminal = createTerminalEmulator(80);
  const out = captureStdout(terminal);
  try {
    const keys = listenTurnKeys({
      control: { requestStop() {}, shouldStop: () => false },
      onLine: () => {},
      promptOptions: {
        stats: { contextLimit: 1000000, estimatedContextTokens: 9400 },
        mcpInfo: null,
      },
    });

    async function* streamOf(...deltas) {
      for (const delta of deltas) {
        yield { choices: [{ delta }] };
        await new Promise((r) => setImmediate(r));
      }
    }

    await runAgent({
      model: 'test/minimax-m3',
      plansMode: false,
      skills: [],
      cache: false,
      effort: 'high',
      messages: [],
      initialPrompt: 'Explain',
      createCompletion: async () => streamOf(
        { reasoning_details: [{ type: 'reasoning.text', id: 't1', text: 'The user' }] },
        { reasoning_details: [{ type: 'reasoning.text', id: 't1', text: 'The user asks' }] },
        { content: 'Here is the plan.' },
      ),
    });

    keys.stop();

    // We assert two things across the rendered history:
    //   1. The thinking header '✻ Thinking…' is visible at some point
    //      during the stream (it is replaced by 'Thought for Ns' at the
    //      end of the stream — that is by design, not a regression).
    //   2. The final grid contains the Thought for Ns summary and the
    //      last cumulative delta.
    const snapshotsStripped = out.snapshots.map((lines) => lines.map(stripTerminalCodes).join('\n'));
    assert.ok(
      snapshotsStripped.some((s) => /✻\s*Thinking…/.test(s)),
      'the thinking header must be visible at some point during the stream',
    );
    assert.ok(
      snapshotsStripped.some((s) => /\bThe user\b(?! asks)/.test(s)),
      'the first delta row must be visible by itself at some point during the stream',
    );

    const visible = terminal.lines.map((l) => stripTerminalCodes(l));
    const flat = visible.join('\n');
    assert.match(flat, /✻\s*Thought for/, 'the final summary must remain visible');
    assert.match(flat, /\bThe user asks\b/, 'the last cumulative delta must remain visible');

    // The prompt frame must be drawn strictly below the last thinking
    // row, not on top of it.
    const lastThinkingRow = Math.max(
      ...visible.map((line, row) => /Thinking|Thought|The user/.test(line) ? row : -1),
    );
    const firstPromptRow = Math.min(
      ...visible.map((line, row) => /Enter prompt or \/help/.test(line) ? row : Number.MAX_SAFE_INTEGER),
    );
    assert.ok(firstPromptRow > lastThinkingRow,
      `prompt frame (row ${firstPromptRow}) must sit below the thinking block (last row ${lastThinkingRow})`);
  } finally {
    out.restore();
    process.stdout.isTTY = previousIsTTY;
    process.stdout.columns = previousColumns;
    restoreStdin();
  }
});
