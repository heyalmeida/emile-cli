// prompt-input-render.test.js — drives persistentPromptInput through real
// keypress sequences against a minimal ANSI terminal emulator, asserting the
// screen state after each step (rebuild of the prompt block renderer).
//
// The emulator implements exactly the escape sequences the module emits:
//   \r  \n  ESC[K  ESC[0J  ESC[<n>A  ESC[<n>C  and ignores SGR (ESC[...m).
// Any wrap would therefore be visible as broken assertions, since the
// module guarantees it never writes a line wider than the terminal.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';

function createEmulator(columns = 80) {
  const state = {
    lines: [''],
    row: 0,
    col: 0,
    columns,
    wrapped: false,
  };

  function ensureRow(row) {
    while (state.lines.length <= row) state.lines.push('');
  }

  function putChar(ch) {
    ensureRow(state.row);
    if (state.col >= state.columns) { state.wrapped = true; return; }
    const line = state.lines[state.row];
    while (line.length < state.col) state.lines[state.row] = line.padEnd(state.col);
    const base = state.lines[state.row];
    state.lines[state.row] = base.slice(0, state.col) + ch + base.slice(state.col + 1);
    state.col += 1;
  }

  function apply(chunk) {
    let i = 0;
    while (i < chunk.length) {
      const ch = chunk[i];
      if (ch === '\x1B') {
        const m = /^\x1B\[([0-9;]*)([A-Za-z])/.exec(chunk.slice(i));
        if (m) {
          const n = Number(m[1]) || 0;
          switch (m[2]) {
            case 'A': state.row = Math.max(0, state.row - n); break;
            case 'C': state.col += n; break;
            case 'K': ensureRow(state.row); state.lines[state.row] = state.lines[state.row].slice(0, state.col); break;
            case 'J': {
              if (m[1] === '0' || m[1] === '') {
                ensureRow(state.row);
                state.lines[state.row] = state.lines[state.row].slice(0, state.col);
                state.lines.length = state.row + 1;
              }
              break;
            }
            case 'm': break; // SGR — zero width, ignore
            default: break;  // sequences the module never emits
          }
          i += m[0].length;
          continue;
        }
        i += 1; // unknown escape — drop
        continue;
      }
      if (ch === '\r') { state.col = 0; i += 1; continue; }
      if (ch === '\n') { state.row += 1; state.col = 0; ensureRow(state.row); i += 1; continue; }
      putChar(ch);
      i += 1;
    }
  }

  return {
    apply,
    get lines() { return state.lines.slice(); },
    get row() { return state.row; },
    get col() { return state.col; },
    get wrapped() { return state.wrapped; },
    text() { return state.lines.join('\n'); },
  };
}

function withFakeTerminal(t, columns = 80) {
  const emu = createEmulator(columns);
  const writes = [];
  const fakeStdout = { columns, write: (s) => { writes.push(s); emu.apply(String(s)); } };
  const fakeStdin = new PassThrough();
  fakeStdin.isTTY = true;
  fakeStdin.isRaw = false;
  fakeStdin.setRawMode = () => {};
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStdin = process.stdin;
  const originalColumns = Object.getOwnPropertyDescriptor(process.stdout, 'columns');
  // Only string writes come from the module; the node:test harness writes
  // its internal NDJSON protocol as Buffers — never feed those to the
  // emulator (they would land at the cursor, i.e. inside the input row).
  process.stdout.write = (s) => { if (typeof s === 'string') fakeStdout.write(s); return true; };
  Object.defineProperty(process.stdout, 'columns', { value: columns, configurable: true });
  Object.defineProperty(process, 'stdin', { value: fakeStdin, configurable: true });
  t.after(() => {
    process.stdout.write = originalStdoutWrite;
    if (originalColumns) Object.defineProperty(process.stdout, 'columns', originalColumns);
    else Object.defineProperty(process.stdout, 'columns', { value: undefined, configurable: true });
    Object.defineProperty(process, 'stdin', { value: originalStdin, configurable: true });
    fakeStdin.destroy();
  });
  return { emu, fakeStdin };
}

function typeKeys(fakeStdin, keys) {
  for (const k of keys) {
    if (typeof k === 'string') {
      fakeStdin.emit('keypress', k, { name: k });
    } else {
      fakeStdin.emit('keypress', k.str ?? undefined, k);
    }
  }
}

test('initial render draws one clean prompt block', async (t) => {
  const { emu } = withFakeTerminal(t);
  const { persistentPromptInput } = await import('../src/ui/prompt-input-persistent.js');
  persistentPromptInput({ onSubmit: () => 'next' });

  const lines = emu.lines;
  assert.ok(lines[0].includes('─'), 'first line is the top border');
  assert.equal(lines.filter(l => l.includes('─') && !l.includes('·')).length, 2, 'exactly top and bottom borders');
  assert.ok(emu.text().includes('Enter prompt or /help'), 'placeholder visible');
  assert.ok(emu.wrapped === false, 'nothing wrapped');
});

test('typing a slash command keeps a single clean block with the menu', async (t) => {
  const { emu, fakeStdin } = withFakeTerminal(t);
  const { persistentPromptInput } = await import('../src/ui/prompt-input-persistent.js');
  persistentPromptInput({ onSubmit: () => 'next' });

  typeKeys(fakeStdin, ['/', 'm']);

  const text = emu.text();
  assert.ok(text.includes('❯ /m'), 'input row shows the typed command');
  assert.ok(text.includes('/model'), 'menu shows /model');
  assert.ok(text.includes('/maxloop'), 'menu shows /maxloop');
  const borderCount = emu.lines.filter(l => l.includes('─') && !l.includes('·')).length;
  assert.equal(borderCount, 3, 'top border, menu/input border, bottom border — no residue');
  assert.equal(emu.lines.filter(l => /❯\s+\/m\b/.test(l.replace(/\x1B\[[0-9;]*m/g, ''))).length, 1, 'input row appears exactly once');
  assert.ok(emu.wrapped === false);
  // Cursor sits right after the typed text on the input row.
  const inputRow = emu.lines.findIndex(l => /❯\s+\/m\b/.test(l.replace(/\x1B\[[0-9;]*m/g, '')));
  assert.equal(emu.row, inputRow, 'cursor is on the input row');
  assert.equal(emu.lines[emu.row].replace(/\x1B\[[0-9;]*m/g, '').slice(0, emu.col), '  ❯  /m', 'cursor is exactly after the typed text');
});

test('arrow keys move the menu selection and Enter completes the command', async (t) => {
  const { emu, fakeStdin } = withFakeTerminal(t);
  const submitted = [];
  const { persistentPromptInput } = await import('../src/ui/prompt-input-persistent.js');
  persistentPromptInput({ onSubmit: (line) => { submitted.push(line); return 'next'; } });

  typeKeys(fakeStdin, ['/', 'm']);
  typeKeys(fakeStdin, [{ name: 'down' }]); // /model -> /maxloop
  typeKeys(fakeStdin, [{ name: 'return' }]); // complete, not submit

  assert.deepEqual(submitted, [], 'first Enter only completes the command');
  assert.ok(emu.text().replace(/\x1B\[[0-9;]*m/g, '').includes('❯  /maxloop'), 'input completed to the selected command');
  typeKeys(fakeStdin, [{ name: 'return' }]); // submit (input === '/maxloop', menu closed by exact match)
  await new Promise(r => setImmediate(r)); // deferred redraw after the async onSubmit settles
  assert.deepEqual(submitted, ['/maxloop'], 'second Enter submits');
  assert.ok(emu.text().includes('── /maxloop'), 'user divider printed');
  assert.equal(emu.lines.filter(l => l.replace(/\x1B\[[0-9;]*m/g, '').includes('/maxloop')).length, 1, 'divider only — input row cleared, no leftovers');
  assert.ok(emu.text().includes('Enter prompt or /help'), 'fresh empty prompt below the divider');
});

test('Tab accepts autocomplete and only toggles Plans mode without matches', async (t) => {
  const { emu, fakeStdin } = withFakeTerminal(t);
  const [{ persistentPromptInput }, { config }] = await Promise.all([
    import('../src/ui/prompt-input-persistent.js'),
    import('../src/config.js'),
  ]);
  const previousPlansMode = config.plansMode;
  config.plansMode = false;
  t.after(() => { config.plansMode = previousPlansMode; });
  persistentPromptInput({ onSubmit: () => 'next' });

  typeKeys(fakeStdin, ['/', 'm', { name: 'tab' }]);
  const stripped = emu.text().replace(/\x1B\[[0-9;]*m/g, '');
  assert.ok(stripped.includes('❯  /model'), 'Tab fills the highlighted slash command');
  assert.equal(config.plansMode, false, 'autocomplete does not toggle Plans mode');

  typeKeys(fakeStdin, [{ name: 'backspace' }, { name: 'backspace' }, { name: 'backspace' }, { name: 'backspace' }, { name: 'backspace' }, { name: 'backspace' }, { name: 'tab' }]);
  assert.equal(config.plansMode, true, 'Tab keeps its Plans-mode fallback without matches');
});

test('nested switch picker owns stdin exclusively and returns it resumed to the prompt', async (t) => {
  const { emu, fakeStdin } = withFakeTerminal(t);
  const [{ persistentPromptInput }, { promptSwitchSession }] = await Promise.all([
    import('../src/ui/prompt-input-persistent.js'),
    import('../src/ui/switch-session.js'),
  ]);
  let selectedId = null;
  persistentPromptInput({
    onSubmit(line) {
      if (line !== '/switch') return 'next';
      return promptSwitchSession([
        { id: 'session_1', summary: 'Regression session', updatedAt: '2026-09-01T12:00:00.000Z' },
      ], () => {}).then((id) => {
        selectedId = id;
        return 'next';
      });
    },
  });

  typeKeys(fakeStdin, [...'/switch', { name: 'return' }]);
  assert.equal(fakeStdin.listenerCount('keypress'), 1, 'only the nested picker consumes keys');

  typeKeys(fakeStdin, [{ name: 'return' }]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(selectedId, 'session_1');
  assert.equal(fakeStdin.listenerCount('keypress'), 1, 'the persistent prompt reacquires key ownership');
  assert.equal(fakeStdin.isPaused(), false, 'stdin is resumed after picker cleanup');

  typeKeys(fakeStdin, ['x']);
  assert.match(emu.text().replace(/\x1B\[[0-9;]*m/g, ''), /❯\s+x/, 'typing works immediately after /switch');
});

test('backspace and narrowing keep the screen residue-free', async (t) => {
  const { emu, fakeStdin } = withFakeTerminal(t);
  const { persistentPromptInput } = await import('../src/ui/prompt-input-persistent.js');
  persistentPromptInput({ onSubmit: () => 'next' });

  typeKeys(fakeStdin, ['/', 'w', 'e', 'b']);
  assert.ok(emu.text().includes('/websearch'));
  typeKeys(fakeStdin, [{ name: 'backspace' }, { name: 'backspace' }]); // '/w'
  const stripped = emu.lines.map(l => l.replace(/\x1B\[[0-9;]*m/g, ''));
  assert.ok(stripped.some(l => l.includes('/websearch')), 'menu still lists /websearch for /w');
  assert.ok(stripped.some(l => /❯\s+\/w$/.test(l)), 'input narrowed to /w');
  assert.ok(!stripped.some(l => /❯\s+\/web$/.test(l)), 'old longer input fully erased');
  typeKeys(fakeStdin, [{ name: 'backspace' }]); // '/'
  assert.ok(emu.text().replace(/\x1B\[[0-9;]*m/g, '').includes('❯ /'));
  typeKeys(fakeStdin, [{ name: 'backspace' }]); // '' — placeholder back
  assert.ok(emu.text().includes('Enter prompt or /help'));
  assert.ok(emu.wrapped === false);
});

test('long input lines are clipped, never wrapped', async (t) => {
  const { emu, fakeStdin } = withFakeTerminal(t, 80);
  const { persistentPromptInput } = await import('../src/ui/prompt-input-persistent.js');
  persistentPromptInput({ onSubmit: () => 'next' });

  typeKeys(fakeStdin, Array.from({ length: 120 }, () => 'a'));
  assert.equal(emu.wrapped, false, 'no line ever exceeded the terminal width');
  assert.ok(emu.lines.every(l => l.length <= 80), 'every drawn line fits in 80 columns');
  assert.ok(/❯\s+a{20}/.test(emu.text().replace(/\x1B\[[0-9;]*m/g, '')), 'text is visible from the start of the line');
});

test('prompt layout stays bounded at 60, 80 and 120 columns', async () => {
  const { buildPromptLayout } = await import('../src/ui/prompt-input-persistent.js');
  for (const columns of [60, 80, 120]) {
    const input = 'review the persistent prompt lifecycle '.repeat(8);
    const layout = buildPromptLayout({
      input,
      cursor: input.length,
      columns,
      matches: [],
      footerSegments: ['model', 'tokens: 10k / 200k (5%)'],
    });
    const plainLines = layout.lines.map(line => line.replace(/\x1B\[[0-9;]*m/g, ''));
    assert.ok(plainLines.every(line => line.length <= columns), `all ${columns}-column rows stay bounded`);
    assert.ok(layout.cursorCol + 2 < columns, `cursor remains inside the ${columns}-column input row`);
    assert.equal(layout.cursorRow, layout.rows.length - 1, `cursor reaches the final ${columns}-column row`);
    assert.equal(layout.cursorCol, 2 + (input.length % (columns - 5)), `cursor offset is exact at ${columns} columns`);
  }
});

test('clipping a styled line preserves an ANSI reset', async () => {
  const [{ clipLine }, { C, stripAnsi }] = await Promise.all([
    import('../src/ui/prompt-input-persistent.js'),
    import('../src/ui/theme.js'),
  ]);
  const clipped = clipLine(C.accent('x'.repeat(100)), 20);
  assert.equal(stripAnsi(clipped).length, 20);
  assert.match(clipped, /\x1B\[0m$/, 'a clipped color cannot leak into the next terminal row');
});

test('Shift+Enter keeps multiline input without submitting early', async (t) => {
  const { fakeStdin } = withFakeTerminal(t);
  const submitted = [];
  const { persistentPromptInput } = await import('../src/ui/prompt-input-persistent.js');
  persistentPromptInput({ onSubmit: (line) => { submitted.push(line); return 'next'; } });

  typeKeys(fakeStdin, ['a', { name: 'return', shift: true }, 'b']);
  assert.deepEqual(submitted, [], 'Shift+Enter only inserts a newline');
  typeKeys(fakeStdin, [{ name: 'return' }]);
  assert.deepEqual(submitted, ['a\nb']);
});

test('Esc clears the idle draft without shutting down the persistent prompt', async (t) => {
  const { emu, fakeStdin } = withFakeTerminal(t);
  const { persistentPromptInput } = await import('../src/ui/prompt-input-persistent.js');
  persistentPromptInput({ onSubmit: () => 'next' });

  typeKeys(fakeStdin, [...'draft', { name: 'escape' }, 'x']);
  const stripped = emu.text().replace(/\x1B\[[0-9;]*m/g, '');
  assert.match(stripped, /❯\s+x/, 'keypress handling remains active after Esc');
  assert.doesNotMatch(stripped, /draft/, 'the canceled draft is erased');
});

test('redraw() handle repaints a clean block below agent output', async (t) => {
  const { emu, fakeStdin } = withFakeTerminal(t);
  const { persistentPromptInput } = await import('../src/ui/prompt-input-persistent.js');
  let busyFlag = false;
  let api = null;
  persistentPromptInput({
    onSubmit: () => 'next',
    busy: { isBusy: () => busyFlag },
    onReady: (handle) => { api = handle; },
  });
  assert.ok(api, 'onReady received a handle');

  // Submit a prompt: block erased, divider printed, render suppressed while busy.
  typeKeys(fakeStdin, ['h', 'i']);
  busyFlag = true; // runAgentTurn sets isAgentBusy synchronously before onSubmit returns
  typeKeys(fakeStdin, [{ name: 'return' }]);
  assert.ok(emu.text().includes('── hi'), 'divider printed');
  const text = emu.text();
  assert.ok(!text.includes('Enter prompt'), 'no prompt block while busy');

  // Simulate agent output scrolling below, then the turn ends.
  process.stdout.write('agent output line\n');
  busyFlag = false;
  api.redraw();

  const text2 = emu.text();
  assert.ok(text2.includes('agent output line'), 'agent output preserved');
  assert.ok(text2.includes('Enter prompt or /help'), 'prompt block back after the turn');
  assert.equal(text2.split('── hi').length - 1, 1, 'divider appears exactly once');
  assert.ok(emu.wrapped === false);
});
