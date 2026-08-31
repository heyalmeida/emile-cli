import test from 'node:test';
import assert from 'node:assert/strict';

import { formatToolSummary, printToolSummary } from '../src/ui/tool-lines.js';

function stripAnsi(value) {
  return value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
}

function tool(name) {
  return { function: { name, arguments: '{}' } };
}

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
