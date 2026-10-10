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
