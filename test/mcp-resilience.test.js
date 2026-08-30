import test from 'node:test';
import assert from 'node:assert/strict';

import { config } from '../src/config.js';
import {
  MCP_RECONNECT_DELAYS,
  createMcpTransport,
  describeMcpServer,
  initializeMcp,
  normalizeMcpTransport,
  resolveMcpHeaders,
  sanitizeMcpError,
  shutdownMcp,
} from '../src/mcp.js';

test('uses bounded MCP reconnect delays', () => {
  assert.deepEqual([...MCP_RECONNECT_DELAYS], [500, 1000, 2000]);
});

test('normalizes supported MCP transports and rejects unknown ones', () => {
  assert.equal(normalizeMcpTransport({}), 'stdio');
  assert.equal(normalizeMcpTransport({ transport: 'sse' }), 'sse');
  assert.equal(normalizeMcpTransport({ type: 'http' }), 'http');
  assert.throws(() => normalizeMcpTransport({ transport: 'websocket' }), /Unsupported MCP transport/);
});

test('creates STDIO, SSE and streamable HTTP transports without connecting', () => {
  assert.equal(createMcpTransport({ command: 'node', args: [] }).constructor.name, 'StdioClientTransport');
  assert.equal(createMcpTransport({ transport: 'sse', url: 'https://mcp.example/sse' }).constructor.name, 'SSEClientTransport');
  assert.equal(createMcpTransport({ transport: 'http', url: 'https://mcp.example/mcp' }).constructor.name, 'StreamableHTTPClientTransport');
  assert.throws(() => createMcpTransport({ transport: 'http', url: 'file:///tmp/mcp' }), /does not allow/);
});

test('resolves MCP header environment placeholders and fails closed', () => {
  const previous = process.env.EMILE_MCP_TEST_TOKEN;
  process.env.EMILE_MCP_TEST_TOKEN = 'secret-value';
  try {
    assert.deepEqual(resolveMcpHeaders({ Authorization: 'Bearer ${EMILE_MCP_TEST_TOKEN}' }), {
      Authorization: 'Bearer secret-value',
    });
    assert.throws(() => resolveMcpHeaders({ Authorization: 'Bearer ${EMILE_MCP_MISSING}' }), /Missing environment variable/);
    assert.throws(() => resolveMcpHeaders({ Authorization: 'Bearer ok\nInjected: yes' }), /newline/);
  } finally {
    if (previous === undefined) delete process.env.EMILE_MCP_TEST_TOKEN;
    else process.env.EMILE_MCP_TEST_TOKEN = previous;
  }
});

test('consent preview never exposes URL credentials or headers', () => {
  const preview = describeMcpServer('remote', {
    transport: 'http',
    url: 'https://user:password@mcp.example/mcp?token=secret',
    headers: { Authorization: 'Bearer ${EMILE_MCP_TEST_TOKEN}' },
    tools: [{ name: 'read' }],
  });
  assert.equal(preview.endpoint, 'https://mcp.example/mcp');
  assert.equal(preview.tools, 'read');
  assert.equal(preview.endpoint.includes('secret'), false);
  assert.equal(JSON.stringify(preview).includes('password'), false);
});

test('sanitizes remote URLs and bearer values in MCP errors', () => {
  const safe = sanitizeMcpError(new Error('request failed at https://user:pass@mcp.example/mcp?token=secret with Bearer abc123'));
  assert.equal(safe.includes('pass'), false);
  assert.equal(safe.includes('token=secret'), false);
  assert.equal(safe.includes('Bearer [redacted]'), true);
});

test('rejected first connection does not establish a remote MCP client', async () => {
  const previous = config.mcpConfig;
  const serverName = `consent-test-${Date.now()}`;
  config.mcpConfig = {
    mcpServers: {
      [serverName]: { transport: 'http', url: 'https://mcp.example/mcp' },
    },
  };
  try {
    const result = await initializeMcp({ confirmConnection: async () => false });
    assert.equal(result.connected, 0);
    assert.match(result.details[0].error, /not approved/i);
  } finally {
    await shutdownMcp();
    config.mcpConfig = previous;
  }
});
