// prompt-input-render.test.js — drives persistentPromptInput through real
// keypress sequences against a minimal ANSI terminal emulator, asserting the
// screen state after each step (rebuild of the prompt block renderer).
//
// The emulator implements exactly the escape sequences the module emits:
//   \r  \n  ESC[K  ESC[<n>A  ESC[<n>B  ESC[<n>C  ESC7  ESC8  and ignores SGR
// (ESC[...m) plus the DEC 2026 synchronized-output pair (ESC[?2026h/l), which has
// no cursor or cell effect by definition — the frame it wraps is presented
// atomically, but every row lands exactly where it would have landed without the
// wrapper (specs/2026-10-10-ui-commit-frontier).
// ESC[<n>B and ESC7/ESC8 are what the bounded frame erase walks with
// (specs/2026-10-10-frame-transition-flicker): modelling them is what makes the
// residue-free assertions meaningful for the erase that replaced ESC[0J.
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
    saved: null,
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
      if (chunk.startsWith('\x1B7', i)) { state.saved = { row: state.row, col: state.col }; i += 2; continue; }
      if (chunk.startsWith('\x1B8', i)) {
        if (state.saved) ({ row: state.row, col: state.col } = state.saved);
        i += 2;
        continue;
      }
      if (ch === '\x1B') {
        // `?`/`>`/`!` private-mode markers are accepted so the DEC 2026 pair is
        // consumed as one sequence instead of leaking `[?2026h` as text.
        const m = /^\x1B\[([?>!]?[0-9;]*)([A-Za-z])/.exec(chunk.slice(i));
        if (m) {
          const n = Number(m[1]) || 0;
          switch (m[2]) {
            case 'A': state.row = Math.max(0, state.row - n); break;
            case 'B': ensureRow(state.row + n); state.row += n; break;
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
            case 'h': break; // ESC[?2026h / ESC[?2004h — mode set, no cursor effect
            case 'l': break; // ESC[?2026l / ESC[?2004l — mode reset, no cursor effect
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

function withFakeTerminal(t, columns = 80, rows = 40) {
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
  const originalIsTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
  const originalRows = Object.getOwnPropertyDescriptor(process.stdout, 'rows');
  // Only string writes come from the module; the node:test harness writes
  // its internal NDJSON protocol as Buffers — never feed those to the
  // emulator (they would land at the cursor, i.e. inside the input row).
  // They must still reach the real stdout: dropping them corrupts the
  // harness protocol and silently loses test results from the report.
  process.stdout.write = (s) => {
    if (typeof s === 'string') { fakeStdout.write(s); return true; }
    return originalStdoutWrite(s);
  };
  // The renderer checks stdout TTY-ness and viewport height before moving the
  // cursor (paste-burst fix, specs/2026-10-09-paste-burst-redraw). Pin both,
  // or a suite run behind a pipe would silently take the non-TTY path.
  Object.defineProperty(process.stdout, 'columns', { value: columns, configurable: true, writable: true });
  Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true, writable: true });
  Object.defineProperty(process.stdout, 'rows', { value: rows, configurable: true, writable: true });
  Object.defineProperty(process, 'stdin', { value: fakeStdin, configurable: true });
  t.after(() => {
    process.stdout.write = originalStdoutWrite;
    for (const [name, descriptor] of [
      ['columns', originalColumns], ['isTTY', originalIsTTY], ['rows', originalRows],
    ]) {
      if (descriptor) Object.defineProperty(process.stdout, name, descriptor);
      else Object.defineProperty(process.stdout, name, { value: undefined, configurable: true, writable: true });
    }
    Object.defineProperty(process, 'stdin', { value: originalStdin, configurable: true });
    fakeStdin.destroy();
  });
  return { emu, fakeStdin, writes };
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

/** One top border `╭` is written per full-block render. */
function renderCount(writes) {
  return writes.join('').split('╭').length - 1;
}

/** A coalesced burst paints when the burst goes quiet (10 ms in the module). */
function burstSettled() {
  return new Promise((resolve) => setTimeout(resolve, 40));
}

/** Cursor-up sequences (`ESC[nA`) actually written to stdout. */
function cursorUps(writes) {
  return (writes.join('').match(/\x1B\[(\d+)A/g) || [])
    .map((seq) => Number(/(\d+)/.exec(seq)[1]));
}

/** Every `ESC[nA` in a log stays inside the viewport (`n <= rows - 1`). */
function assertClamped(writes, rows, label) {
  const ups = cursorUps(writes);
  assert.ok(ups.length > 0, `${label}: a climb is expected in this scenario`);
  assert.ok(
    ups.every((n) => n <= rows - 1),
    `${label}: no ESC[nA above rows-1 = ${rows - 1} (saw ${ups.join(',')})`,
  );
}

/** Strips SGR plus the DEC 2026 pair so frame text can be asserted directly. */
function plainFrame(text) {
  return String(text).replace(/\x1B\[[0-9;]*m/g, '').split('\x1B[?2026h').join('').split('\x1B[?2026l').join('');
}

/** Lines the draft hides: `row000` .. `row199`, one per input row. */
function tallDraft(count = 200) {
  return Array.from({ length: count }, (_, i) => `row${String(i).padStart(3, '0')}`);
}

/** Types a whole draft as one bracketed paste (the real terminal's shape). */
function pasteDraft(fakeStdin, payload) {
  fakeStdin.emit('keypress', undefined, { name: 'paste-start' });
  typeKeys(fakeStdin, [...payload].flatMap((ch) => (ch === '\n' ? [{ name: 'return' }] : [ch])));
  fakeStdin.emit('keypress', undefined, { name: 'paste-end' });
}

/** Reconstructs the draft visible on screen from the block's input rows. */
function visibleInputText(emu) {
  const plain = emu.lines.map((line) => line.replace(/\x1B\[[0-9;]*m/g, ''));
  const top = plain.findIndex((line) => line.includes('╭'));
  const bottom = plain.findIndex((line) => line.includes('╰'));
  assert.ok(top >= 0 && bottom > top, 'a complete prompt block is on screen');
  return plain
    .slice(top + 1, bottom)
    .map((line, index) => (index === 0 ? line.slice(5) : line.slice(4)))
    .join('\n')
    .replace(/\s+$/, '');
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
  const plainText = text.replace(/\x1B\[[0-9;]*m/g, '');
  assert.match(plainText, /›\s+\/m\b/, 'input row shows the typed command');
  assert.ok(text.includes('/model'), 'menu shows /model');
  assert.ok(text.includes('/maxloop'), 'menu shows /maxloop');
  assert.match(plainText, /●\s+\/model/, 'selected suggestion uses a distinct menu marker');
  assert.doesNotMatch(plainText, /›\s+\/model/, 'the input glyph is never reused as a suggestion marker');
  const borderCount = emu.lines.filter(l => l.includes('─') && !l.includes('·')).length;
  assert.equal(borderCount, 3, 'top border, menu/input border, bottom border — no residue');
  assert.equal(emu.lines.filter(l => /›\s+\/m\b/.test(l.replace(/\x1B\[[0-9;]*m/g, ''))).length, 1, 'input row appears exactly once');
  assert.ok(emu.wrapped === false);
  // Cursor sits right after the typed text on the input row.
  const inputRow = emu.lines.findIndex(l => /›\s+\/m\b/.test(l.replace(/\x1B\[[0-9;]*m/g, '')));
  assert.equal(emu.row, inputRow, 'cursor is on the input row');
  assert.equal(emu.lines[emu.row].replace(/\x1B\[[0-9;]*m/g, '').slice(0, emu.col), '  ›  /m', 'cursor is exactly after the typed text');
});

test('arrow keys move the menu selection and Enter completes the command', async (t) => {
  const { emu, fakeStdin } = withFakeTerminal(t);
  const submitted = [];
  const { persistentPromptInput } = await import('../src/ui/prompt-input-persistent.js');
  persistentPromptInput({ onSubmit: (line) => { submitted.push(line); return 'next'; } });

  typeKeys(fakeStdin, ['/', 'm']);
  // '/m' matches /model, /memory, /maxloop (registry order); two downs land
  // on /maxloop.
  typeKeys(fakeStdin, [{ name: 'down' }, { name: 'down' }]); // /model -> /maxloop
  typeKeys(fakeStdin, [{ name: 'return' }]); // complete, not submit

  assert.deepEqual(submitted, [], 'first Enter only completes the command');
  assert.ok(emu.text().replace(/\x1B\[[0-9;]*m/g, '').includes('›  /maxloop'), 'input completed to the selected command');
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
  assert.ok(stripped.includes('›  /model'), 'Tab fills the highlighted slash command');
  assert.equal(config.plansMode, false, 'autocomplete does not toggle Plans mode');

  typeKeys(fakeStdin, [{ name: 'backspace' }, { name: 'backspace' }, { name: 'backspace' }, { name: 'backspace' }, { name: 'backspace' }, { name: 'backspace' }, { name: 'tab' }]);
  assert.equal(config.plansMode, true, 'Tab keeps its Plans-mode fallback without matches');
});

test('nested switch picker owns stdin exclusively and returns it resumed to the prompt', async (t) => {
  const { emu, fakeStdin, writes } = withFakeTerminal(t);
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
  assert.equal((writes.join('').match(/\x1B\[\?2004h/g) || []).length, 2, 'the resumed idle prompt re-enables bracketed paste');

  typeKeys(fakeStdin, ['x']);
  assert.match(emu.text().replace(/\x1B\[[0-9;]*m/g, ''), /›\s+x/, 'typing works immediately after /switch');
});

test('backspace and narrowing keep the screen residue-free', async (t) => {
  const { emu, fakeStdin } = withFakeTerminal(t);
  const { persistentPromptInput } = await import('../src/ui/prompt-input-persistent.js');
  persistentPromptInput({ onSubmit: () => 'next' });

  typeKeys(fakeStdin, ['/', 'w', 'e', 'b']);
  await burstSettled(); // four synchronous text keys coalesce into one burst
  assert.ok(emu.text().includes('/websearch'));
  typeKeys(fakeStdin, [{ name: 'backspace' }, { name: 'backspace' }]); // '/w'
  const stripped = emu.lines.map(l => l.replace(/\x1B\[[0-9;]*m/g, ''));
  assert.ok(stripped.some(l => l.includes('/websearch')), 'menu still lists /websearch for /w');
  assert.ok(stripped.some(l => /›\s+\/w$/.test(l)), 'input narrowed to /w');
  assert.ok(!stripped.some(l => /›\s+\/web$/.test(l)), 'old longer input fully erased');
  typeKeys(fakeStdin, [{ name: 'backspace' }]); // '/'
  assert.match(emu.text().replace(/\x1B\[[0-9;]*m/g, ''), /›\s+\/$/m);
  typeKeys(fakeStdin, [{ name: 'backspace' }]); // '' — placeholder back
  assert.ok(emu.text().includes('Enter prompt or /help'));
  assert.ok(emu.wrapped === false);
});

test('long input lines are clipped, never wrapped', async (t) => {
  const { emu, fakeStdin } = withFakeTerminal(t, 80);
  const { persistentPromptInput } = await import('../src/ui/prompt-input-persistent.js');
  persistentPromptInput({ onSubmit: () => 'next' });

  typeKeys(fakeStdin, Array.from({ length: 120 }, () => 'a'));
  // 120 synchronous keys are a paste burst: the coalesced frame lands when the
  // burst goes quiet (the assertions below are the pre-coalescing ones).
  await burstSettled();
  assert.equal(emu.wrapped, false, 'no line ever exceeded the terminal width');
  assert.ok(emu.lines.every(l => l.length <= 80), 'every drawn line fits in 80 columns');
  assert.ok(/›\s+a{20}/.test(emu.text().replace(/\x1B\[[0-9;]*m/g, '')), 'text is visible from the start of the line');
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

test('bracketed multiline paste stays editable until a separate Enter', async (t) => {
  const { emu, fakeStdin, writes } = withFakeTerminal(t);
  const submitted = [];
  const { persistentPromptInput } = await import('../src/ui/prompt-input-persistent.js');
  persistentPromptInput({ onSubmit: (line) => { submitted.push(line); return 'next'; } });

  fakeStdin.emit('keypress', undefined, { name: 'paste-start' });
  typeKeys(fakeStdin, [...'Title', { name: 'return' }, ...'- first', { name: 'return' }, ...'- second']);
  fakeStdin.emit('keypress', undefined, { name: 'paste-end' });
  assert.deepEqual(submitted, [], 'pasting must not submit the draft');
  assert.match(emu.text(), /Title\n\s+- first\n\s+- second/, 'every pasted line remains visible');
  assert.ok(writes.join('').includes('\x1B[?2004h'), 'the idle prompt enables bracketed paste');

  fakeStdin.emit('keypress', '', { name: 'return' });
  assert.deepEqual(submitted, ['Title\n- first\n- second'], 'Enter submits the complete normalized payload');
  fakeStdin.emit('keypress', '', { ctrl: true, name: 'c' });
  assert.ok(writes.join('').includes('\x1B[?2004l'), 'cleanup disables bracketed paste');
});

test('Esc clears the idle draft without shutting down the persistent prompt', async (t) => {
  const { emu, fakeStdin } = withFakeTerminal(t);
  const { persistentPromptInput } = await import('../src/ui/prompt-input-persistent.js');
  persistentPromptInput({ onSubmit: () => 'next' });

  typeKeys(fakeStdin, [...'draft', { name: 'escape' }, 'x']);
  const stripped = emu.text().replace(/\x1B\[[0-9;]*m/g, '');
  assert.match(stripped, /›\s+x/, 'keypress handling remains active after Esc');
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

// ── Paste-burst coalescing + viewport clamp (specs/2026-10-09-paste-burst-redraw) ──

test('bracketed paste coalesces into a single render', async (t) => {
  const { emu, fakeStdin, writes } = withFakeTerminal(t);
  const submitted = [];
  const { persistentPromptInput } = await import('../src/ui/prompt-input-persistent.js');
  persistentPromptInput({ onSubmit: (line) => { submitted.push(line); return 'next'; } });

  // 21 lines / 20 pasted Enters / >500 characters, delivered exactly as a real
  // bracketed burst arrives: one keypress event per character.
  const lines = Array.from({ length: 21 }, (_, i) => `line ${i} MARKER${String(i).padStart(2, '0')} ${'x'.repeat(8)}`);
  const payload = lines.join('\n');
  assert.ok(payload.length >= 500, `fixture is a large paste (${payload.length} chars)`);
  assert.equal((payload.match(/\n/g) || []).length, 20, '20 pasted Enters');

  const before = renderCount(writes);
  fakeStdin.emit('keypress', undefined, { name: 'paste-start' });
  typeKeys(fakeStdin, [...payload].flatMap((ch) => (ch === '\n' ? [{ name: 'return' }] : [ch])));
  fakeStdin.emit('keypress', undefined, { name: 'paste-end' });

  assert.deepEqual(submitted, [], 'pasting must not submit');
  assert.ok(renderCount(writes) - before <= 2, `at most the initial + one paste render (got ${renderCount(writes) - before})`);
  const plain = emu.text().replace(/\x1B\[[0-9;]*m/g, '');
  for (const line of lines) {
    assert.equal(plain.split(line).length - 1, 1, 'pasted line appears exactly once: ' + line);
  }
  assert.equal(visibleInputText(emu), payload, 'the complete draft is visible, unduplicated');
  assert.equal(emu.wrapped, false, 'nothing wrapped');

  fakeStdin.emit('keypress', '', { name: 'return' });
  assert.deepEqual(submitted, [payload], 'a separate Enter submits the whole payload');
});

test('non-bracketed keypress burst is coalesced', async (t) => {
  const { emu, fakeStdin, writes } = withFakeTerminal(t);
  const { persistentPromptInput } = await import('../src/ui/prompt-input-persistent.js');
  persistentPromptInput({ onSubmit: () => 'next' });

  const chars = Array.from({ length: 200 }, (_, i) => String.fromCharCode(97 + (i % 26)));
  const before = renderCount(writes);
  typeKeys(fakeStdin, chars); // no paste markers at all — the Windows-console case

  assert.ok(renderCount(writes) - before < 10, `burst repaints bounded (${renderCount(writes) - before} renders, was 200)`);
  await burstSettled();
  assert.equal(visibleInputText(emu).replace(/\s+/g, ''), chars.join(''), 'every character landed exactly once');
  assert.equal(emu.wrapped, false);
});

test('a burst flushes before the next editing key acts', async (t) => {
  const { emu, fakeStdin } = withFakeTerminal(t);
  const { persistentPromptInput } = await import('../src/ui/prompt-input-persistent.js');
  persistentPromptInput({ onSubmit: () => 'next' });

  typeKeys(fakeStdin, ['h', 'e', 'l', 'l', 'o']); // burst opens on the third key
  assert.equal(emu.text().includes('hello'), false, 'no frame is painted inside the burst');
  typeKeys(fakeStdin, [{ name: 'backspace' }]); // non-pasteable: owed frame first, then edit
  assert.equal(visibleInputText(emu), 'hell', 'the owed frame was paid before the key applied');
});

test('Enter after a burst still submits the draft', async (t) => {
  const { fakeStdin } = withFakeTerminal(t);
  const submitted = [];
  const { persistentPromptInput } = await import('../src/ui/prompt-input-persistent.js');
  persistentPromptInput({ onSubmit: (line) => { submitted.push(line); return 'next'; } });

  typeKeys(fakeStdin, ['a', 'b', 'c']); // coalesced burst
  typeKeys(fakeStdin, [{ name: 'return' }]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(submitted, ['abc'], 'coalescing never swallows a deliberate submit');
});

test('cursor-up is clamped to the terminal viewport', async (t) => {
  const { emu, fakeStdin, writes } = withFakeTerminal(t, 80, 10);
  const { persistentPromptInput } = await import('../src/ui/prompt-input-persistent.js');
  persistentPromptInput({ onSubmit: () => 'next' });

  // 30 input rows on a 10-row terminal: erase distance would be 30 unclamped.
  const payload = Array.from({ length: 30 }, (_, i) => `row${String(i).padStart(2, '0')}`).join('\n');
  fakeStdin.emit('keypress', undefined, { name: 'paste-start' });
  typeKeys(fakeStdin, [...payload].flatMap((ch) => (ch === '\n' ? [{ name: 'return' }] : [ch])));
  fakeStdin.emit('keypress', undefined, { name: 'paste-end' });
  typeKeys(fakeStdin, [{ name: 'left' }, { name: 'left' }]); // force redraws of the tall block
  await burstSettled();

  const ups = cursorUps(writes);
  assert.ok(ups.length > 0, 'the block was redrawn with cursor movement');
  assert.ok(ups.every((n) => n <= 9), `no ESC[nA exceeds rows-1 (max seen: ${Math.max(...ups)})`);
  const plain = emu.text().replace(/\x1B\[[0-9;]*m/g, '');
  const renders = renderCount(writes);
  assert.ok(renders <= 4, 'paste + two edits cost at most four renders: ' + renders);
  // Height overflow degrades to scroll: a frame that left the viewport can
  // never be erased, so copies track renders — never pasted lines or keys.
  assert.ok(plain.split('row00').length - 1 <= renders, 'no more copies than full-block renders');
});

test('non-TTY stdout never receives a cursor-up', async (t) => {
  const { fakeStdin, writes } = withFakeTerminal(t, 80, 10);
  Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true, writable: true });
  const { persistentPromptInput } = await import('../src/ui/prompt-input-persistent.js');
  persistentPromptInput({ onSubmit: () => 'next' });

  fakeStdin.emit('keypress', undefined, { name: 'paste-start' });
  typeKeys(fakeStdin, [...'hello\nworld'].flatMap((ch) => (ch === '\n' ? [{ name: 'return' }] : [ch])));
  fakeStdin.emit('keypress', undefined, { name: 'paste-end' });
  typeKeys(fakeStdin, [{ name: 'escape' }, 'd']);
  await burstSettled();

  assert.deepEqual(cursorUps(writes), [], 'no ESC[nA reaches a non-TTY stdout');
  assert.ok(writes.join('').includes('world'), 'the draft itself still reaches the output');
});

test('a coalesced burst never survives cleanup', async (t) => {
  const { fakeStdin, writes } = withFakeTerminal(t);
  const { persistentPromptInput } = await import('../src/ui/prompt-input-persistent.js');
  persistentPromptInput({ onSubmit: () => 'next' });

  typeKeys(fakeStdin, ['a', 'b', 'c']); // burst open, frame owed
  fakeStdin.emit('keypress', '', { ctrl: true, name: 'c' }); // shutdown
  const writesAtShutdown = writes.length;
  assert.ok(writesAtShutdown > 0, 'the prompt wrote to stdout');
  await burstSettled();

  assert.equal(writes.length, writesAtShutdown, 'no write lands after cleanup');
  assert.ok(writes.join('').includes('\x1B[?2004l'), 'cleanup still disables bracketed paste');
});

// ── Viewport-budgeted prompt block + the P2-19 clamps ────────────────────────
// specs/2026-10-10-ui-commit-frontier (deep-dive P1-14 Stage A, subsuming P2-18
// and P2-19). The block is budgeted by `stdout.rows`, so the erase can always
// reach its own top, and no `src/ui/` renderer can ask for a climb the viewport
// cannot honour.

test('the block never exceeds its budget at any terminal height', async () => {
  const { buildPromptLayout, PROMPT_MIN_BLOCK_ROWS } = await import('../src/ui/prompt-input-persistent.js');
  const draft = tallDraft().join('\n');
  const matches = Array.from({ length: 6 }, (_, i) => ({ name: `/cmd-${i}`, desc: `suggestion ${i}` }));

  for (let maxRows = 1; maxRows <= 30; maxRows += 1) {
    for (const cursor of [0, Math.floor(draft.length / 2), draft.length]) {
      const layout = buildPromptLayout({
        input: draft,
        cursor,
        columns: 80,
        maxRows,
        matches,
        selectedIndex: 3,
        footerSegments: ['model', 'tokens'],
      });
      assert.ok(
        layout.lines.length <= maxRows,
        `maxRows=${maxRows} cursor=${cursor}: height ${layout.lines.length} must not exceed the budget`,
      );
      if (maxRows >= PROMPT_MIN_BLOCK_ROWS) {
        assert.ok(
          layout.inputRowIndex + layout.cursorRow < layout.height,
          `maxRows=${maxRows} cursor=${cursor}: the cursor row must be drawn`,
        );
      }
    }
  }
});

test('promptFrameBudget follows the live terminal and never goes below one row', async () => {
  const { promptFrameBudget } = await import('../src/ui/prompt-input-persistent.js');
  const saved = Object.getOwnPropertyDescriptor(process.stdout, 'rows');
  try {
    for (const [rows, expected] of [[24, 23], [8, 7], [40, 39], [2, 1], [1, 1], [undefined, 23]]) {
      Object.defineProperty(process.stdout, 'rows', { value: rows, configurable: true, writable: true });
      assert.equal(promptFrameBudget(), expected, `rows=${String(rows)} budgets rows-1 (floored at 1)`);
    }
  } finally {
    if (saved) Object.defineProperty(process.stdout, 'rows', saved);
    else Object.defineProperty(process.stdout, 'rows', { value: undefined, configurable: true, writable: true });
  }
});

test('a draft taller than the budget is windowed around the cursor', async () => {
  const { buildPromptLayout } = await import('../src/ui/prompt-input-persistent.js');
  const lines = tallDraft();
  const draft = lines.join('\n');
  const layoutFor = (cursor, maxRows, footerSegments = ['model']) =>
    buildPromptLayout({ input: draft, cursor, columns: 80, maxRows, footerSegments });
  const plain = (layout) => layout.lines.map((line) => line.replace(/\x1B\[[0-9;]*m/g, ''));

  // Cursor at the end: only "earlier" rows can be hidden.
  const atEnd = layoutFor(draft.length, 23);
  assert.ok(atEnd.height <= 23, `block height ${atEnd.height} must not exceed the budget`);
  assert.equal(atEnd.elidedLater, 0, 'nothing is hidden below the last row');
  assert.ok(atEnd.elidedEarlier > 0, 'the rows above the window are hidden');
  const endLines = plain(atEnd);
  assert.ok(endLines.includes(`  ⌃ ${atEnd.elidedEarlier} earlier rows`), 'the hidden count is reported above the window');
  assert.ok(!endLines.some((line) => line.includes('⌄')), 'no later marker when the window touches the end');
  const drawnInputRows = endLines.slice(atEnd.inputRowIndex, atEnd.inputRowIndex + atEnd.cursorRow + 1);
  assert.ok(drawnInputRows.at(-1).includes('row199'), 'the cursor row is drawn (it is the last draft row)');
  assert.equal(atEnd.elidedEarlier + drawnInputRows.length, lines.length, 'hidden + drawn accounts for every input row');

  // Cursor in the middle: both markers appear and the counts stay exact.
  const middleCursor = draft.indexOf('row100');
  assert.ok(middleCursor > 0, 'the fixture has a row100');
  const inMiddle = layoutFor(middleCursor, 23);
  assert.ok(inMiddle.height <= 23);
  assert.ok(inMiddle.elidedEarlier > 0 && inMiddle.elidedLater > 0, 'both sides are hidden around a middle cursor');
  const midLines = plain(inMiddle);
  assert.ok(midLines.includes(`  ⌃ ${inMiddle.elidedEarlier} earlier rows`));
  assert.ok(midLines.includes(`  ⌄ ${inMiddle.elidedLater} later rows`));
  const cursorLine = midLines[inMiddle.inputRowIndex + inMiddle.cursorRow];
  assert.match(cursorLine, /row100/, 'the cursor row is always inside the window');
  // The window is exactly the contiguous slice the markers advertise: this
  // fixture wraps one draft line per row, so the labels are unambiguous.
  const drawnLabels = midLines.slice(inMiddle.inputRowIndex).filter((line) => /row\d{3}/.test(line)).map((l) => l.trim());
  assert.equal(drawnLabels[0], `row${String(inMiddle.elidedEarlier).padStart(3, '0')}`, 'the window starts where the earlier count says');
  assert.equal(drawnLabels.at(-1), `row${String(lines.length - 1 - inMiddle.elidedLater).padStart(3, '0')}`, 'and ends where the later count says');
  assert.equal(drawnLabels.length, lines.length - inMiddle.elidedEarlier - inMiddle.elidedLater, 'every other row is drawn');

  // A tiny terminal: same guarantee, no crash.
  const tiny = layoutFor(draft.length, 7);
  assert.ok(tiny.height <= 7, `tiny budget respected (height ${tiny.height})`);
  assert.ok(tiny.cursorRow >= 0 && tiny.inputRowIndex + tiny.cursorRow < tiny.height, 'the cursor row is still drawn');
  const tinyLines = plain(tiny);
  assert.ok(tinyLines.some((line) => line.includes('row199')), 'the draft tail is what a caret-at-the-end shows');
});

test('a draft that fits keeps the block exactly as before (no markers)', async () => {
  const { buildPromptLayout } = await import('../src/ui/prompt-input-persistent.js');
  const input = 'short draft';
  const layout = buildPromptLayout({ input, cursor: input.length, columns: 80, maxRows: 23, footerSegments: ['model'] });
  const text = layout.lines.join('\n').replace(/\x1B\[[0-9;]*m/g, '');

  assert.equal(layout.elidedEarlier, 0);
  assert.equal(layout.elidedLater, 0);
  assert.doesNotMatch(text, /⌃|⌄/, 'a fitting block carries no elision marker');
  assert.equal(layout.height, 4, 'top border, input row, bottom border, footer');
});

test('a 200-line draft never draws a block taller than the terminal', async (t) => {
  const { emu, fakeStdin, writes } = withFakeTerminal(t, 80, 24);
  const { persistentPromptInput } = await import('../src/ui/prompt-input-persistent.js');
  persistentPromptInput({ onSubmit: () => 'next' });

  const lines = tallDraft();
  pasteDraft(fakeStdin, lines.join('\n'));
  const frame = writes.at(-1); // the whole block is ONE write
  const height = frame.split('\n').length - 1;
  assert.ok(height <= 23, `block height ${height} must stay within rows-1`);
  assert.ok(plainFrame(frame).includes('⌃ '), 'the hidden rows above the window are reported');

  const marker = /⌃ (\d+) earlier rows/.exec(plainFrame(frame));
  const firstVisible = lines.find((line) => plainFrame(frame).includes(line));
  assert.ok(marker, 'the elision marker carries a count');
  assert.equal(Number(marker[1]), lines.indexOf(firstVisible), 'the reported count equals the hidden rows');

  assertClamped(writes, 24, 'persistent prompt at rows=24');
  assert.equal(emu.wrapped, false, 'no row wraps');
});

test('scrolling the caret re-windows the draft and reports both sides', async (t) => {
  const { fakeStdin, writes } = withFakeTerminal(t, 80, 24);
  const { persistentPromptInput } = await import('../src/ui/prompt-input-persistent.js');
  persistentPromptInput({ onSubmit: () => 'next' });

  const lines = tallDraft();
  pasteDraft(fakeStdin, lines.join('\n'));
  // Walking left through the draft moves the caret up; the window follows it.
  typeKeys(fakeStdin, Array.from({ length: 600 }, () => ({ name: 'left' })));

  const frame = plainFrame(writes.at(-1));
  assert.match(frame, /⌃ \d+ earlier rows/, 'rows above the window are reported');
  assert.match(frame, /⌄ \d+ later rows/, 'rows below the window are reported');
  assert.ok(frame.split('\n').length - 1 <= 23, 'the block stays inside the budget while scrolling');
  assertClamped(writes, 24, 'persistent prompt while re-windowing');
});

test('a tiny terminal keeps the block inside rows-1 and the caret visible', async (t) => {
  const { emu, fakeStdin, writes } = withFakeTerminal(t, 80, 8);
  const { persistentPromptInput } = await import('../src/ui/prompt-input-persistent.js');
  persistentPromptInput({ onSubmit: () => 'next' });

  const lines = tallDraft();
  pasteDraft(fakeStdin, lines.join('\n'));
  const frame = plainFrame(writes.at(-1));
  const height = writes.at(-1).split('\n').length - 1;

  assert.ok(height <= 7, `block height ${height} must stay within rows-1 = 7`);
  assert.match(frame, /row199/, 'the caret row is drawn, no crash on a tiny terminal');
  assertClamped(writes, 8, 'persistent prompt at rows=8');
  assert.equal(emu.wrapped, false);
});

test('submitting a tall draft leaves no remnant: the erase reaches the block top', async (t) => {
  const { emu, fakeStdin, writes } = withFakeTerminal(t, 80, 24);
  const submitted = [];
  const { persistentPromptInput } = await import('../src/ui/prompt-input-persistent.js');
  persistentPromptInput({ onSubmit: (line) => { submitted.push(line); return 'next'; } });

  const lines = tallDraft();
  pasteDraft(fakeStdin, lines.join('\n'));
  const rendersBeforeSubmit = renderCount(writes);
  fakeStdin.emit('keypress', '', { name: 'return' });
  await burstSettled();

  assert.equal(submitted.length, 1, 'the complete draft was submitted');
  assert.ok(plainFrame(writes.join('')).includes('── row000'), 'the divider carries the submitted draft');
  assertClamped(writes, 24, 'submit path');
  assert.equal(renderCount(writes) - rendersBeforeSubmit, 1, 'exactly one frame follows the submit');
  assert.ok(writes.at(-1).split('\n').length - 1 <= 5, 'and it is the fresh empty prompt, not a repaint of the tall block');
  // The erase reached the block top and erased downward, so no part of the tall
// frame survives below the divider — the "prompt cortado" remnant cannot
// happen, whatever the draft height was.
  const onScreen = emu.lines.map((line) => line.replace(/\x1B\[[0-9;]*m/g, ''));
  assert.equal(onScreen.filter((line) => line.includes('╭')).length, 1, 'only the fresh prompt block remains');
  assert.equal(emu.text().split('── row000').length - 1, 1, 'the divider appears exactly once');
  assert.doesNotMatch(onScreen.join('\n'), /row198/, 'no row of the erased tall frame is left on screen');
  assert.equal(emu.wrapped, false);
});

// ── P2-19: the remaining unconditional climbs go through the shared clamp ────

test('the active-turn frame clamps every climb to the viewport', async (t) => {
  const { fakeStdin, writes } = withFakeTerminal(t, 80, 8);
  const { listenTurnKeys } = await import('../src/ui/turn-keys.js');
  const queued = [];
  const keys = listenTurnKeys({
    control: { requestStop() {}, shouldStop: () => false },
    onLine: (line) => queued.push(line),
    promptOptions: {},
  });

  try {
    // A draft far taller than the 8-row terminal: draw, caret climb and hide all
    // have to stay inside the viewport.
    const lines = tallDraft(40);
    pasteDraft(fakeStdin, lines.join('\n'));
    typeKeys(fakeStdin, [{ name: 'left' }]);
    assertClamped(writes, 8, 'turn-keys frame at rows=8');
    assert.match(plainFrame(writes.join('')), /⌃ \d+ earlier rows/, 'the active frame is budgeted too');
  } finally {
    keys.stop();
  }
});

test('the model picker clamps its frame climb to the viewport', async (t) => {
  const { fakeStdin, writes } = withFakeTerminal(t, 80, 8);
  const { promptSearchPicker } = await import('../src/ui/model-picker.js');
  const options = Array.from({ length: 20 }, (_, index) => ({ value: `p/model-${index}`, label: `Model ${index}` }));

  const settled = promptSearchPicker(options, { message: 'Select a model', limit: 20 });
  typeKeys(fakeStdin, ['m']); // a longer list than the terminal is tall
  typeKeys(fakeStdin, [{ name: 'escape' }]);

  assertClamped(writes, 8, 'model picker at rows=8');
  assert.equal(await settled, null, 'the picker still cancels cleanly');
});

test('the legacy prompt clamps its erase and caret climbs to the viewport', async (t) => {
  const { fakeStdin, writes } = withFakeTerminal(t, 80, 8);
  const { promptInput } = await import('../src/ui/prompt-input.js');
  promptInput({ message: '❯', placeholder: 'draft' });

  // Ten wrapped rows on an 8-row terminal: erase + caret climbs unclamped used
  // to ask for distances the viewport cannot honour.
  typeKeys(fakeStdin, [...'a'.repeat(700), { name: 'return', shift: true }, ...'b'.repeat(200)]);

  assertClamped(writes, 8, 'prompt-input at rows=8');
  fakeStdin.removeAllListeners('keypress');
});

// ── Atomic active-turn transition (specs/2026-10-10-frame-transition-flicker) ──
// The flicker itself is not assertable in CI — it is a property of what the
// terminal PRESENTS. These cases assert the necessary conditions the fix
// established: one synchronized update per burst, an erase bounded to the
// frame's own rows (never ESC[0J), a coalesced single redraw, no redundant
// repaint, and the tmux / non-TTY guards.

const countOf = (text, needle) => text.split(needle).length - 1;

/**
 * The writes the UI module itself made. `node:test`'s own reporter also writes
 * STRINGS to stdout (its NDJSON protocol), and while a turn leases stdout those
 * go through the transition like any other write — correct behaviour, but noise
 * for frame assertions (they easily dwarf a frame line, which is why the
 * in-place proof must not be asserted over the raw concatenation).
 */
function moduleWrites(writes) {
  return writes.filter((w) => !(w.startsWith('{') && w.includes('"')));
}

/** Waits for the coalesced redraw (one event-loop turn). */
function frameSettled() {
  return new Promise((resolve) => setImmediate(resolve));
}

/** Starts a real active-turn key listener over the captured terminal. */
async function startTurn(t, { rows = 24, isTTY = true } = {}) {
  const { fakeStdin, writes } = withFakeTerminal(t, 80, rows);
  // `enabled` is decided when the lease takes over, so a non-TTY stdout has to be
  // pinned before the listener starts — that is the real "piped stdout" startup.
  Object.defineProperty(process.stdout, 'isTTY', { value: isTTY, configurable: true, writable: true });
  const { listenTurnKeys } = await import('../src/ui/turn-keys.js');
  const keys = listenTurnKeys({
    control: { requestStop() {}, shouldStop: () => false },
    onLine: () => {},
    promptOptions: {},
  });
  t.after(() => keys.stop());
  const frames = () => moduleWrites(writes);
  return { fakeStdin, writes, keys, frames };
}

test('a burst of agent writes makes ONE synchronized frame transition', async (t) => {
  const { frames, keys } = await startTurn(t);
  // Settle whatever the harness itself wrote through the lease, then open and
  // settle the measured transition inside ONE synchronous block, so only the
  // burst belongs to it.
  keys.redraw();
  const framesBefore = countOf(frames().join(''), '╭');
  const beginsBefore = countOf(frames().join(''), '\x1B[?2026h');

  // The spinner writes every 80 ms and deltas arrive at 50–100/s: 50 writes
  // inside one event-loop turn is ordinary streaming traffic.
  for (let i = 0; i < 50; i += 1) process.stdout.write(`agent line ${i}\n`);

  assert.equal(countOf(frames().join(''), '\x1B[?2026h'), beginsBefore + 1, 'the burst opens exactly one update');
  assert.equal(countOf(frames().join(''), '╭'), framesBefore, 'no half-written frame is presented inside the burst');

  keys.redraw(); // the CLI's own re-anchor, which settles the owed redraw

  const after = frames().join('');
  assert.equal(countOf(after, '\x1B[?2026h'), beginsBefore + 1, 'exactly one BEGIN for the burst');
  assert.equal(countOf(after, '\x1B[?2026l'), beginsBefore + 1, 'exactly one END for the burst');
  assert.equal(countOf(after, '╭'), framesBefore + 1, 'at most one full frame draw');
  const plain = plainFrame(after);
  for (const probe of ['agent line 0', 'agent line 25', 'agent line 49']) {
    assert.equal(countOf(plain, probe), 1, `the agent's bytes land exactly once: ${probe}`);
  }
  assert.equal(countOf(plain, 'Enter prompt or /help'), 2, 'the frame is on screen exactly once');
});

test('the coalesced redraw lands on the next turn and every update is closed', async (t) => {
  const { frames } = await startTurn(t);
  const drawsBefore = countOf(frames().join(''), '╭');

  process.stdout.write('streamed line\n');
  await frameSettled();

  const text = frames().join('');
  assert.equal(countOf(text, '╭'), drawsBefore + 1, 'the deferred redraw painted the frame once');
  assert.equal(
    countOf(text, '\x1B[?2026h'),
    countOf(text, '\x1B[?2026l'),
    'no synchronized update is left open',
  );
});

test('a frame hide erases only the frame own rows, never to the end of the screen', async (t) => {
  const { fakeStdin, frames, keys } = await startTurn(t);

  // The initial draw is ONE write, and each of its rows carries a clear.
  const draw = frames().at(-1);
  const frameRows = countOf(draw, '\r\x1B[K');
  assert.ok(frameRows >= 3, `the frame drew ${frameRows} rows`);

  keys.redraw(); // settle the harness's own traffic before measuring
  const mark = frames().length;
  process.stdout.write('agent output\n');
  keys.redraw();

  const transition = frames().slice(mark).join('');
  assert.equal(countOf(transition, '\x1B[?2026h'), 1, 'the transition is one synchronized update');
  assert.doesNotMatch(transition, /\x1B\[0?J/, 'no erase reaches the end of the screen');
  const erase = transition.slice(0, transition.indexOf('\x1B8'));
  assert.equal(countOf(erase, '\r\x1B[K'), frameRows, 'one clear per row the frame drew');
  assert.equal(countOf(erase, '\x1B[1B'), frameRows - 1, 'stepped down its own rows only, never further');
  assert.equal(countOf(erase, '\x1B[1A'), 1, 'one clamped climb to the frame top');
  assert.ok(transition.includes('╭'), 'and the frame comes back inside the same update');

  // The bounded erase must not disturb the agent's output above the frame.
  assert.equal(countOf(plainFrame(transition), 'agent output'), 1);
  fakeStdin.emit('keypress', 'x', { name: 'x' });
  assert.ok(frames().length > mark, 'the draft repaint still happens');
});

test('an unchanged frame is not re-emitted while it is on screen', async (t) => {
  const { fakeStdin, frames, keys } = await startTurn(t);

  const before = frames().length;
  keys.redraw(); // the handle the CLI calls after each agent write
  keys.redraw();
  assert.equal(frames().length, before, 'a byte-identical frame emits nothing — not even an erase');

  fakeStdin.emit('keypress', 'x', { name: 'x' });
  assert.ok(frames().length > before, 'a changed frame is repainted');
  const afterChange = frames().length;
  keys.redraw();
  assert.equal(frames().length, afterChange, 'and the unchanged frame after it is not');
});

test('the transition omits the synchronized markers under tmux', async (t) => {
  const previousTmux = process.env.TMUX;
  process.env.TMUX = '1';
  try {
    const { frames } = await startTurn(t);
    process.stdout.write('tick\n');
    await frameSettled();

    const text = frames().join('');
    assert.ok(text.includes('╭'), 'the frame is still drawn under tmux');
    assert.doesNotMatch(text, /\x1B\[\?2026[hl]/, 'tmux repaints the pane itself — no DEC 2026 marker');
  } finally {
    if (previousTmux === undefined) delete process.env.TMUX;
    else process.env.TMUX = previousTmux;
  }
});

test('a non-TTY stdout receives neither marker nor cursor escape from the frame', async (t) => {
  const { frames } = await startTurn(t, { isTTY: false });

  process.stdout.write('tick\n');
  await frameSettled();

  const text = frames().join('');
  assert.equal(countOf(text, 'tick'), 1, 'the agent bytes still reach the pipe');
  assert.doesNotMatch(text, /╭/, 'no frame is drawn to a pipe');
  assert.doesNotMatch(text, /\x1B\[\?2026[hl]/, 'no DEC 2026 marker to a pipe');
  assert.doesNotMatch(text, /\x1B\[\d*[ABCD]/, 'no cursor escape to a pipe');
});

test('the row reservation is emitted only when the redraw cannot prove it lands in place', async (t) => {
  const { frames, keys } = await startTurn(t);

  // Spinner traffic: no newline, so the redraw lands exactly on the rows the
  // frame just vacated. Those rows are on screen, so the pre-scroll reservation
  // is pointless — and it was the per-repaint screen scroll (F3).
  keys.redraw();
  let mark = frames().length;
  process.stdout.write('\r\x1B[K⠋ thinking…');
  keys.redraw();
  const inPlaceDraw = frames().slice(mark).find((w) => w.includes('╭'));
  assert.ok(inPlaceDraw, 'the frame is still redrawn in place');
  assert.doesNotMatch(inPlaceDraw, /\n{2,}\x1B\[\d*A\x1B7/, 'no reservation when the rows are known to be free');

  // A write that moved the cursor down cannot prove it: the reservation stays,
  // because a scroll between ESC7 and ESC8 would make ESC8 restore into the frame.
  mark = frames().length;
  process.stdout.write('a response line\n');
  keys.redraw();
  const reservedDraw = frames().slice(mark).find((w) => w.includes('╭'));
  assert.ok(reservedDraw, 'the frame is redrawn after the response line');
  assert.match(reservedDraw, /\n{2,}\x1B\[\d*A\x1B7/, 'the reservation is kept when the proof does not hold');
});

test('the shared clamp suppresses embedded climbs on a non-TTY stdout too', async (t) => {
  const { clampedCursorUp, writeCursorUp } = await import('../src/ui/terminal-cursor.js');
  const { writes } = withFakeTerminal(t, 80, 10);
  const saved = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
  try {
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true, writable: true });
    // An embedded climb must vanish exactly like a written one: a pipe cannot
    // honor cursor movement, so it must not receive the escape as text either.
    assert.equal(clampedCursorUp(9), 0, 'an embedded climb is zero on a pipe');
    writeCursorUp(9);
    assert.deepEqual(cursorUps(writes), [], 'no ESC[nA reaches the pipe');
  } finally {
    if (saved) Object.defineProperty(process.stdout, 'isTTY', saved);
  }
});
