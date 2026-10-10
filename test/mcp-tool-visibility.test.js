import test from 'node:test';
import assert from 'node:assert/strict';

import { formatToolSummary, printToolSummary } from '../src/ui/tool-lines.js';

function stripAnsi(value) {
  return value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
}

function tool(name) {
  return { function: { name, arguments: '{}' } };
}

/** A tool call with a JSON argument string. */
function call(name, args = {}) {
  return { function: { name, arguments: JSON.stringify(args) } };
}

/** Renders a tool batch and returns the stripped output + raw bytes. */
async function renderSummary(calls, { columns = 80 } = {}) {
  const writes = [];
  const original = process.stdout.write;
  const previousColumns = Object.getOwnPropertyDescriptor(process.stdout, 'columns');
  Object.defineProperty(process.stdout, 'columns', { value: columns, configurable: true, writable: true });
  process.stdout.write = chunk => { writes.push(String(chunk)); return true; };
  const { printToolSummary } = await import('../src/ui/tool-lines.js');
  try {
    printToolSummary(calls);
  } finally {
    process.stdout.write = original;
    if (previousColumns) Object.defineProperty(process.stdout, 'columns', previousColumns);
    else Object.defineProperty(process.stdout, 'columns', { value: undefined, configurable: true, writable: true });
  }
  const raw = writes.join('');
  return { raw, lines: stripAnsi(raw).split('\n') };
}

// ── Verb-grouping (specs/2026-10-11-design-tool-grouping) ────────────────────

test('a batch of 20 reads collapses into one row with an explicit hidden count', async () => {
  const calls = Array.from({ length: 20 }, (_, i) => call('readFile', { path: `src/file-${String(i).padStart(2, '0')}.js` }));
  const { lines } = await renderSummary(calls);

  const readRows = lines.filter(line => line.includes('● read'));
  assert.equal(readRows.length, 1, 'the batch is one row, not 20');
  assert.match(readRows[0], /src\/file-00\.js, src\/file-01\.js, src\/file-02\.js, \+17 more/, 'three distinct paths then the count');
  assert.equal(readRows[0].includes('file-03.js'), false, 'the fourth path is inside the count, not written out');
  assert.equal(lines.filter(line => /file-\d\d\.js/.test(line)).length, 1, 'no path leaks onto a second row');
});

test('three similar calls group; two stay a sequence', async () => {
  const three = await renderSummary([
    call('grepSearch', { query: 'auth' }), call('grepSearch', { query: 'token' }), call('grepSearch', { query: 'session' }),
  ]);
  const grepRows = three.lines.filter(line => line.includes('● grep'));
  assert.equal(grepRows.length, 1, 'three adjacent searches are one batch');
  assert.match(grepRows[0], /auth, token, session/, 'every argument is listed');
  assert.equal(/more/.test(grepRows[0]), false, 'nothing is hidden, so no marker is printed');

  const two = await renderSummary([call('readFile', { path: 'a.js' }), call('readFile', { path: 'b.js' })]);
  assert.equal(two.lines.filter(line => line.includes('● read')).length, 2, 'below the threshold nothing changes');
  assert.match(stripAnsi(two.lines.join('\n')), /a\.js/);
});

test('an interruption splits the batch, and side-effect tools never group', async () => {
  const { lines } = await renderSummary([
    call('readFile', { path: 'a.js' }), call('readFile', { path: 'b.js' }), call('readFile', { path: 'c.js' }),
    call('editFile', { path: 'src/auth.js' }),
    call('readFile', { path: 'd.js' }), call('readFile', { path: 'e.js' }), call('readFile', { path: 'f.js' }),
  ]);
  assert.equal(lines.filter(line => line.includes('● read')).length, 2, 'one batch each side of the edit');
  assert.equal(lines.filter(line => line.includes('● edit')).length, 1, 'the edit keeps its own row (its argument is the information)');
  const firstBatch = lines.findIndex(l => l.includes('● read'));
  const editRow = lines.findIndex(l => l.includes('● edit'));
  const secondBatch = lines.findIndex((l, i) => l.includes('● read') && i > editRow);
  assert.ok(firstBatch < editRow && editRow < secondBatch, 'the rows keep their original order');

  const execs = await renderSummary([
    call('runCommand', { command: 'npm test' }), call('runCommand', { command: 'npm run lint' }), call('runCommand', { command: 'npm run build' }),
  ]);
  assert.equal(execs.lines.filter(line => line.includes('● exec')).length, 3, 'shell commands are never folded');
});

test('repeated arguments are listed once and counted as calls', async () => {
  const { lines } = await renderSummary(Array.from({ length: 5 }, () => call('readFile', { path: 'src/same.js' })));
  const row = lines.find(line => line.includes('● read'));
  assert.equal(row.split('src/same.js').length - 1, 1, 'the same path is listed once');
  assert.match(row, /\+4 more/, 'the count is about calls, so it stays honest about the hidden work');
});

test('a grouped row stays inside the width and keeps its count', async () => {
  const calls = Array.from({ length: 8 }, (_, i) => call('readFile', { path: `src/a-very-long-directory-name/another/deep/path/file-${i}.js` }));
  const { lines } = await renderSummary(calls, { columns: 60 });

  for (const line of lines) assert.ok(line.length <= 60, `line exceeds 60 columns: ${line}`);
  const row = lines.find(line => line.includes('● read'));
  assert.match(row, /\+\d+ more/, 'the marker survives truncation — it is the part that says how much is hidden');
});

test('rows from different MCP servers never merge', async () => {
  const { lines } = await renderSummary([
    call('filesystem__readFile', {}), call('filesystem__readFile', {}), call('filesystem__readFile', {}),
    call('git__readFile', {}), call('git__readFile', {}), call('git__readFile', {}),
  ]);
  const rows = lines.filter(line => line.includes('●'));
  assert.equal(rows.length, 2, 'two batches, one per server label');
  assert.match(rows[0], /\[mcp:filesystem\]/);
  assert.match(rows[1], /\[mcp:git\]/);
});

test('groupRows plans the rows without touching stdout, and the turn counter still sees every call', async () => {
  const { groupRows } = await import('../src/ui/tool-lines.js');
  const details = [
    { label: 'read', arg: 'a', tone: 'passive', mcp: false },
    { label: 'read', arg: 'b', tone: 'passive', mcp: false },
    { label: 'read', arg: 'c', tone: 'passive', mcp: false },
    { label: 'exec', arg: 'x', tone: 'danger', mcp: false },
    { label: 'read', arg: 'd', tone: 'passive', mcp: false },
  ];
  const rows = groupRows(details);
  assert.equal(rows.length, 3, 'one batch, one exec, one lone read');
  assert.equal(rows[0].group, true);
  assert.equal(rows[0].details.length, 3);
  assert.equal(rows[1].detail.tone, 'danger');
  assert.equal(rows[2].detail.arg, 'd');
  assert.deepEqual(groupRows([]), [], 'an empty batch plans nothing');

  // `↳ N tools` counts CALLS, not rows: the batch shape and the turn total are
  // different facts (the counter is consumed by printAssistantResponse).
  const { turnState } = await import('../src/ui/turn-state.js');
  const before = turnState.toolsRun;
  await renderSummary(Array.from({ length: 5 }, (_, i) => call('readFile', { path: `f${i}.js` })));
  assert.equal(turnState.toolsRun - before, 5, 'all five calls are counted even though one row was printed');
});

test('formats MCP server and tool names in the summary', () => {
  const result = formatToolSummary([tool('filesystem__readFile')]);

  assert.equal(result.details[0].label, '[mcp:filesystem]');
  assert.equal(result.details[0].arg, 'readFile');
  assert.equal(result.details[0].mcp, true);
});

test('splits MCP names at the final separator', () => {
  const result = formatToolSummary([tool('team__filesystem__readFile')]);

  assert.equal(result.details[0].label, '[mcp:team__filesystem]');
  assert.equal(result.details[0].arg, 'readFile');
});

test('keeps built-in summary labels unchanged', () => {
  const result = formatToolSummary([{ function: { name: 'readFile', arguments: '{"path":"README.md"}' } }]);

  assert.equal(result.details[0].label, 'read');
  assert.equal(result.details[0].mcp, false);
});

test('aligns multiline tool arguments under the argument column', () => {
  const writes = [];
  const originalWrite = process.stdout.write;
  process.stdout.write = chunk => {
    writes.push(String(chunk));
    return true;
  };

  try {
    printToolSummary([{
      function: {
        name: 'runCommand',
        arguments: JSON.stringify({ command: 'echo first\necho second\npython3 <<\'PY\'' }),
      },
    }]);
  } finally {
    process.stdout.write = originalWrite;
  }

  const output = stripAnsi(writes.join(''));
  const lines = output.split('\n');
  const firstLine = lines.findIndex(line => line.includes('● exec'));
  assert.ok(firstLine >= 0);
  assert.equal(lines[firstLine + 1].indexOf('echo second'), 13);
  assert.equal(lines[firstLine + 2].indexOf('python3 <<\'PY\''), 13);
});

test('sanitizes multiline tool arguments while retaining bounded lines', () => {
  const writes = [];
  const originalWrite = process.stdout.write;
  process.stdout.write = chunk => {
    writes.push(String(chunk));
    return true;
  };

  try {
    printToolSummary([{
      function: {
        name: 'runCommand',
        arguments: JSON.stringify({ command: `\x1b[31mfirst\x1b[0m\n${'x'.repeat(200)}` }),
      },
    }]);
  } finally {
    process.stdout.write = originalWrite;
  }

  const output = stripAnsi(writes.join(''));
  const lines = output.split('\n').filter(Boolean);
  assert.doesNotMatch(output, /\x1b\[/);
  assert.ok(lines.every(line => line.length <= 80));
});
