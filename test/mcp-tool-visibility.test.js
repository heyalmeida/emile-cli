import test from 'node:test';
import assert from 'node:assert/strict';

import { formatToolSummary } from '../src/ui/tool-lines.js';

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
