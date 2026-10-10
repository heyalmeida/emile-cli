/**
 * Stage B contract tests — src/api/transports/ (spec 2026-10-09-provider-system).
 *
 * Covers: request-shape (AC-21, AC-23), response normalization into the
 * frozen agent chunk shape (AC-22, AC-24), stop-reason mapping (AC-25),
 * redirect credential refusal (AC-26), retry discipline (AC-27), malformed
 * SSE tolerance (AC-28), the reasoningStyle body-key matrix (AC-29), the
 * tool-continuation thinking rule (AC-30), and key redaction (AC-31).
 *
 * Everything is hermetic: local node:http fixture servers on 127.0.0.1 and
 * in-process builder/param unit tests. The three end-to-end dispatch probes
 * run in a fresh subprocess with a temp HOME, reusing the pattern from
 * test/provider-config.test.js (HOME + USERPROFILE for os.homedir()).
 * Windows-safe: no chmod-dependent assertions, no POSIX-only APIs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { buildReasoningParams, formatApiError } from '../src/api/client.js';
import {
  buildAnthropicMessagesRequest,
  resolveAnthropicThinking,
  streamAnthropicMessages,
  requestAnthropicMessages,
} from '../src/api/transports/anthropic-messages.js';
import {
  buildResponsesRequest,
  streamResponses,
} from '../src/api/transports/responses.js';

const PROJECT = process.cwd();
const PROJECT_URL = pathToFileURL(PROJECT).href;

// ──────────────────────────────────────────────────────────────
//  Fixture server helpers
// ──────────────────────────────────────────────────────────────

function listenOn(port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve(server);
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
}

function sse(obj) {
  return `event: ${obj.type}\ndata: ${JSON.stringify(obj)}\n\n`;
}

/**
 * One-shot fixture API server. `script` maps hit index (0-based) to a
 * response function. Records every hit: url, headers, parsed JSON body.
 * Returns the server and a baseURL ending in /v1 (the shape the wizard
 * stores and the transports append onto).
 */
async function fixtureServer(script) {
  const server = await listenOn(0);
  const hits = [];
  let connections = 0;
  server.on('connection', () => { connections++; });
  server.on('request', async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    let body = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
    const hit = { index: hits.length, url: req.url, headers: { ...req.headers }, body };
    hits.push(hit);
    const responder = script[hit.index] || script.final || ((_r, s) => { s.writeHead(404).end('{}'); });
    await responder(req, res, hit);
  });
  const port = server.address().port;
  return { server, hits, baseURL: `http://127.0.0.1:${port}/v1`, connections: () => connections };
}

async function sseResponder(events, { status = 200, destroyAfterFirst = false } = {}) {
  return async (req, res) => {
    res.writeHead(status, { 'content-type': 'text/event-stream' });
    for (let i = 0; i < events.length; i++) {
      res.write(sse(events[i]));
      if (destroyAfterFirst && i === 0) {
        await new Promise((r) => setTimeout(r, 30));
        res.socket?.destroy();
        return;
      }
    }
    res.end();
  };
}

async function collect(iterable) {
  const chunks = [];
  for await (const chunk of iterable) chunks.push(chunk);
  return chunks;
}

/** Captures process.stdout.write calls while fn runs (for notice assertions). */
async function captureStdout(fn) {
  const saved = process.stdout.write.bind(process.stdout);
  const writes = [];
  process.stdout.write = (chunk, ...rest) => { writes.push(String(chunk)); return true; };
  try {
    const result = await fn();
    return { result, writes };
  } finally {
    process.stdout.write = saved;
  }
}

const MODEL_MESSAGES = [
  { role: 'system', content: 'You are Emile.' },
  { role: 'user', content: 'Count the files.' },
];
const MODEL_TOOLS = [{
  type: 'function',
  function: { name: 'runCommand', description: 'Run a shell command', parameters: { type: 'object', properties: { command: { type: 'string' } } } },
}];

// ──────────────────────────────────────────────────────────────
//  AC-21 — anthropic-messages request shape (pure builder)
// ──────────────────────────────────────────────────────────────

test('anthropic request: system lifted, max_tokens defaulted, headers and tool schemas exact (AC-21)', () => {
  const req = buildAnthropicMessagesRequest({
    def: { baseURL: 'http://127.0.0.1:9/v1', apiKey: 'test-key-abc' },
    model: 'claude-x',
    messages: MODEL_MESSAGES,
    tools: MODEL_TOOLS,
    effort: null,
  });

  assert.equal(req.url, 'http://127.0.0.1:9/v1/messages');
  assert.equal(req.headers['x-api-key'], 'test-key-abc');
  assert.equal(req.headers['anthropic-version'], '2023-06-01');
  assert.equal(req.headers['content-type'], 'application/json');
  assert.equal(req.body.system, 'You are Emile.');
  assert.equal(req.body.max_tokens, 8192);
  assert.ok(req.body.messages.every(m => m.role !== 'system'));
  assert.deepEqual(req.body.tools, [{
    name: 'runCommand',
    description: 'Run a shell command',
    input_schema: { type: 'object', properties: { command: { type: 'string' } } },
  }]);
});

test('anthropic request: tool conversation flattens to tool_use/tool_result blocks (AC-21)', () => {
  const messages = [
    { role: 'system', content: 'sys' },
    { role: 'user', content: 'run ls' },
    {
      role: 'assistant',
      content: 'I will run it.',
      tool_calls: [
        { id: 'toolu_1', type: 'function', function: { name: 'runCommand', arguments: '{"command":"ls"}' } },
        { id: 'toolu_2', type: 'function', function: { name: 'readFile', arguments: '{"path":"a.txt"}' } },
      ],
    },
    { role: 'tool', tool_call_id: 'toolu_1', content: 'file listing' },
    { role: 'tool', tool_call_id: 'toolu_2', content: 'contents' },
    { role: 'user', content: 'thanks' },
  ];
  const req = buildAnthropicMessagesRequest({
    def: { baseURL: 'http://127.0.0.1:9/v1', apiKey: '' },
    model: 'claude-x',
    messages,
    tools: [],
    effort: null,
  });

  const assistant = req.body.messages.find(m => m.role === 'assistant');
  assert.equal(assistant.content[0].type, 'text');
  assert.deepEqual(assistant.content[1], { type: 'tool_use', id: 'toolu_1', name: 'runCommand', input: { command: 'ls' } });
  assert.equal(assistant.content[2].type, 'tool_use');
  assert.deepEqual(assistant.content[2].input, { path: 'a.txt' });

  const results = req.body.messages.filter(m =>
    m.role === 'user' && Array.isArray(m.content) && m.content[0]?.type === 'tool_result');
  assert.equal(results.length, 1, 'consecutive tool results merge into one user message');
  assert.equal(results[0].content[0].type, 'tool_result');
  assert.equal(results[0].content[0].tool_use_id, 'toolu_1');
  assert.equal(results[0].content[1].tool_use_id, 'toolu_2');
});

test('anthropic thinking: budgets, floors, tool-continuation disable and max_tokens headroom (AC-30)', () => {
  assert.deepEqual(resolveAnthropicThinking({ effort: 'low', maxTokens: null, hasToolResults: false }),
    { thinking: { type: 'enabled', budget_tokens: 1024 }, max_tokens: 8192 });
  assert.deepEqual(resolveAnthropicThinking({ effort: 'none', maxTokens: null, hasToolResults: false }),
    { thinking: { type: 'disabled' }, max_tokens: 8192 });
  // AC-30: with tool results in the conversation, thinking is disabled even
  // when an effort is selected.
  assert.deepEqual(resolveAnthropicThinking({ effort: 'high', maxTokens: null, hasToolResults: true }),
    { thinking: { type: 'disabled' }, max_tokens: 8192 });
  // 'max' raises the cap so the budget keeps answer headroom.
  const max = resolveAnthropicThinking({ effort: 'max', maxTokens: null, hasToolResults: false });
  assert.equal(max.thinking.budget_tokens, 16384);
  assert.equal(max.max_tokens, 16384 + 1024);
});

// ──────────────────────────────────────────────────────────────
//  AC-22 — anthropic-messages normalization (fixture server)
// ──────────────────────────────────────────────────────────────

test('anthropic stream normalizes to the frozen chunk shape with cache-summed usage (AC-22)', async () => {
  const events = [
    { type: 'message_start', message: { usage: { input_tokens: 10, cache_creation_input_tokens: 20, cache_read_input_tokens: 30, output_tokens: 1 } } },
    { type: 'ping' },
    { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'Hmm ' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig==' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Hel' } },
    { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'lo' } },
    { type: 'content_block_stop', index: 1 },
    { type: 'content_block_start', index: 2, content_block: { type: 'tool_use', id: 'toolu_99', name: 'runCommand', input: {} } },
    { type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: '{"command":' } },
    { type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: '"ls"}' } },
    { type: 'content_block_stop', index: 2 },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 5 } },
    { type: 'message_stop' },
  ];
  const fx = await fixtureServer({ 0: await sseResponder(events) });
  try {
    const chunks = await collect(streamAnthropicMessages({
      def: { baseURL: fx.baseURL, apiKey: 'k' }, model: 'claude-x', messages: MODEL_MESSAGES,
    }));

    const text = chunks.flatMap(c => c.choices[0]?.delta?.content || '').join('');
    const reasoning = chunks.flatMap(c => c.choices[0]?.delta?.reasoning_content || '').join('');
    assert.equal(text, 'Hello');
    assert.equal(reasoning, 'Hmm ');

    const skeleton = chunks.find(c => c.choices[0]?.delta?.tool_calls?.[0]?.function?.name);
    assert.equal(skeleton.choices[0].delta.tool_calls[0].id, 'toolu_99');
    assert.equal(skeleton.choices[0].delta.tool_calls[0].function.name, 'runCommand');
    assert.equal(skeleton.choices[0].delta.tool_calls[0].index, 2);
    const argFrags = chunks
      .flatMap(c => c.choices[0]?.delta?.tool_calls || [])
      .filter(t => t.function?.arguments && !t.function.name)
      .map(t => t.function.arguments).join('');
    assert.equal(argFrags, '{"command":"ls"}');

    const final = chunks.at(-1);
    assert.equal(final.choices[0].finish_reason, 'tool_calls');
    assert.deepEqual(final.usage, {
      prompt_tokens: 60, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 30 },
    });
  } finally {
    await closeServer(fx.server);
  }
});

test('anthropic stop reasons map to the frozen vocabulary (AC-25)', async () => {
  const cases = [['max_tokens', 'length'], ['model_context_window_exceeded', 'length'], ['end_turn', 'stop'], ['refusal', 'stop']];
  for (const [stopReason, expected] of cases) {
    const fx = await fixtureServer({
      0: await sseResponder([
        { type: 'message_start', message: { usage: {} } },
        { type: 'message_delta', delta: { stop_reason: stopReason }, usage: {} },
        { type: 'message_stop' },
      ]),
    });
    try {
      const chunks = await collect(streamAnthropicMessages({
        def: { baseURL: fx.baseURL, apiKey: '' }, model: 'm', messages: MODEL_MESSAGES,
      }));
      assert.equal(chunks.at(-1).choices[0].finish_reason, expected, stopReason);
    } finally {
      await closeServer(fx.server);
    }
  }
});

test('anthropic pause_turn maps to stop and surfaces a visible notice (AC-25)', async () => {
  const fx = await fixtureServer({
    0: await sseResponder([
      { type: 'message_start', message: { usage: {} } },
      { type: 'message_delta', delta: { stop_reason: 'pause_turn' }, usage: {} },
      { type: 'message_stop' },
    ]),
  });
  try {
    const { result: chunks, writes } = await captureStdout(() =>
      collect(streamAnthropicMessages({ def: { baseURL: fx.baseURL, apiKey: '' }, model: 'm', messages: MODEL_MESSAGES })));
    assert.equal(chunks.at(-1).choices[0].finish_reason, 'stop');
    assert.ok(writes.some(w => w.includes('paused')));
  } finally {
    await closeServer(fx.server);
  }
});

// ──────────────────────────────────────────────────────────────
//  AC-26/27/28 — HTTP mechanics on the anthropic transport
// ──────────────────────────────────────────────────────────────

test('3xx is fatal, Location is never followed, the key never reaches the target (AC-26)', async () => {
  const target = await listenOn(0);
  const targetHits = [];
  target.on('request', (req, res) => { targetHits.push({ ...req.headers }); res.writeHead(200).end('{}'); });

  const fx = await fixtureServer({
    0: (req, res) => { res.writeHead(302, { location: `http://127.0.0.1:${target.address().port}/steal` }).end(); },
  });
  try {
    await assert.rejects(
      collect(streamAnthropicMessages({ def: { baseURL: fx.baseURL, apiKey: 'sk-ant-secret123' }, model: 'm', messages: MODEL_MESSAGES })),
      /redirected \(HTTP 302\) — refusing to send your key/,
    );
    await new Promise(r => setTimeout(r, 100));
    assert.equal(targetHits.length, 0, 'redirect target must never be contacted');
    assert.equal(fx.hits[0].headers['x-api-key'], 'sk-ant-secret123', 'original host got the key (it is configured there)');
  } finally {
    await closeServer(fx.server);
    await closeServer(target);
  }
});

test('retry before first chunk honors Retry-After and succeeds on the second attempt (AC-27)', async () => {
  const events = [
    { type: 'message_start', message: { usage: {} } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'ok' } },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 2 } },
    { type: 'message_stop' },
  ];
  const fx = await fixtureServer({
    0: (req, res) => { res.writeHead(429, { 'retry-after': '0' }).end('{"error":{"type":"rate_limit_error","message":"slow down"}}'); },
    1: await sseResponder(events),
  });
  try {
    const chunks = await collect(streamAnthropicMessages({
      def: { baseURL: fx.baseURL, apiKey: '' }, model: 'm', messages: MODEL_MESSAGES,
    }));
    assert.equal(fx.hits.length, 2);
    assert.equal(chunks.flatMap(c => c.choices[0]?.delta?.content || '').join(''), 'ok');
  } finally {
    await closeServer(fx.server);
  }
});

test('stream cut after the first event surfaces an error and is never replayed (AC-27/28)', async () => {
  const events = [
    { type: 'message_start', message: { usage: {} } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'partial' } },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: {} },
  ];
  const fx = await fixtureServer({ 0: await sseResponder(events, { destroyAfterFirst: true }) });
  try {
    const chunks = [];
    await assert.rejects((async () => {
      for await (const c of streamAnthropicMessages({ def: { baseURL: fx.baseURL, apiKey: '' }, model: 'm', messages: MODEL_MESSAGES })) {
        chunks.push(c);
      }
    })());
    assert.equal(fx.hits.length, 1, 'no replay after first chunk');
    assert.ok(chunks.length >= 0);
  } finally {
    await closeServer(fx.server);
  }
});

test('malformed SSE data payloads are skipped while the stream continues (AC-28)', async () => {
  const server = await listenOn(0);
  server.on('request', (req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(': keep-alive comment\n\n');
    res.write('event: message_start\ndata: {"type":"message_start","message":{"usage":{\n\n');
    res.write(sse({ type: 'message_start', message: { usage: { input_tokens: 1 } } }));
    res.write('event: content_block_delta\ndata: {broken json here}\n\n');
    res.write(sse({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'fine' } }));
    res.write(sse({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } }));
    res.end();
  });
  const baseURL = `http://127.0.0.1:${server.address().port}/v1`;
  try {
    const chunks = await collect(streamAnthropicMessages({ def: { baseURL, apiKey: '' }, model: 'm', messages: MODEL_MESSAGES }));
    assert.equal(chunks.flatMap(c => c.choices[0]?.delta?.content || '').join(''), 'fine');
    assert.equal(chunks.at(-1).choices[0].finish_reason, 'stop');
  } finally {
    await closeServer(server);
  }
});

// ──────────────────────────────────────────────────────────────
//  AC-23 — responses request shape (pure builder)
// ──────────────────────────────────────────────────────────────

test('responses request: instructions/input flatten, flat tools, store:false, Bearer rule (AC-23)', () => {
  const messages = [
    { role: 'system', content: 'sys instr' },
    { role: 'user', content: 'do it' },
    { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'runCommand', arguments: '{"command":"ls"}' } }] },
    { role: 'tool', tool_call_id: 'call_1', content: 'done' },
  ];
  const req = buildResponsesRequest({
    def: { baseURL: 'http://127.0.0.1:9/v1/', apiKey: 'sk-or-secret1' },
    model: 'gpt-x', messages, tools: MODEL_TOOLS, effort: 'min',
  });

  assert.equal(req.url, 'http://127.0.0.1:9/v1/responses', 'trailing slash trimmed');
  assert.equal(req.headers.Authorization, 'Bearer sk-or-secret1');
  assert.equal(req.body.instructions, 'sys instr');
  assert.equal(req.body.store, false);
  assert.equal(req.body.stream, true);
  assert.deepEqual(req.body.reasoning, { effort: 'minimal', summary: 'auto' });
  assert.equal(req.body.messages, undefined);

  const call = req.body.input.find(i => i.type === 'function_call');
  assert.equal(call.call_id, 'call_1');
  assert.equal(call.name, 'runCommand');
  assert.equal(call.arguments, '{"command":"ls"}', 'arguments stays a JSON string');
  const output = req.body.input.find(i => i.type === 'function_call_output');
  assert.deepEqual(output, { type: 'function_call_output', call_id: 'call_1', output: 'done' });
  assert.equal(req.body.input.every(i => i.role !== 'system'), true);
  assert.deepEqual(req.body.tools, [{ type: 'function', name: 'runCommand', description: 'Run a shell command', parameters: MODEL_TOOLS[0].function.parameters }]);
});

test('responses request: keyless localhost omits the Authorization header entirely (AC-23)', () => {
  const req = buildResponsesRequest({
    def: { baseURL: 'http://127.0.0.1:9/v1', apiKey: '' }, model: 'm', messages: MODEL_MESSAGES,
  });
  assert.equal('Authorization' in req.headers, false);
  assert.equal(req.body.reasoning, undefined);
});

// ──────────────────────────────────────────────────────────────
//  AC-24 — responses normalization (fixture server)
// ──────────────────────────────────────────────────────────────

test('responses stream normalizes events, binds call ids, and never re-emits done text (AC-24)', async () => {
  const events = [
    { type: 'response.created', response: { id: 'resp_1', status: 'in_progress' } },
    { type: 'response.in_progress', response: { id: 'resp_1' } },
    { type: 'response.output_item.added', output_index: 0, item: { type: 'reasoning', id: 'rs_1' } },
    { type: 'response.reasoning_summary_text.delta', item_id: 'rs_1', output_index: 0, summary_index: 0, delta: 'think ' },
    { type: 'response.output_item.added', output_index: 1, item: { type: 'message', id: 'msg_1', role: 'assistant' } },
    { type: 'response.output_text.delta', item_id: 'msg_1', output_index: 1, content_index: 0, delta: 'Hel' },
    { type: 'response.output_text.delta', item_id: 'msg_1', output_index: 1, content_index: 0, delta: 'lo' },
    { type: 'response.output_text.done', item_id: 'msg_1', text: 'Hello' },
    { type: 'response.output_item.added', output_index: 2, item: { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'runCommand', arguments: '' } },
    { type: 'response.function_call_arguments.delta', item_id: 'fc_1', output_index: 2, delta: '{"com' },
    { type: 'response.function_call_arguments.delta', item_id: 'fc_1', output_index: 2, delta: 'mand":"ls"}' },
    { type: 'response.function_call_arguments.done', item_id: 'fc_1', output_index: 2, arguments: '{"command":"ls"}' },
    { type: 'response.output_item.done', output_index: 2, item: { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'runCommand', arguments: '{"command":"ls"}' } },
    { type: 'response.completed', response: { id: 'resp_1', status: 'completed', output: [{ type: 'function_call', call_id: 'call_1', name: 'runCommand', arguments: '{"command":"ls"}' }], usage: { input_tokens: 40, output_tokens: 7, input_tokens_details: { cached_tokens: 12 } } } },
  ];
  const fx = await fixtureServer({ 0: await sseResponder(events) });
  try {
    const chunks = await collect(streamResponses({
      def: { baseURL: fx.baseURL, apiKey: 'k' }, model: 'gpt-x', messages: MODEL_MESSAGES,
    }));

    const text = chunks.flatMap(c => c.choices[0]?.delta?.content || '').join('');
    const reasoning = chunks.flatMap(c => c.choices[0]?.delta?.reasoning_content || '').join('');
    assert.equal(text, 'Hello', 'done events must not duplicate text');
    assert.equal(reasoning, 'think ');

    const skeleton = chunks.find(c => c.choices[0]?.delta?.tool_calls?.[0]?.function?.name);
    assert.equal(skeleton.choices[0].delta.tool_calls[0].id, 'call_1');
    assert.equal(skeleton.choices[0].delta.tool_calls[0].index, 2);
    const args = chunks.flatMap(c => c.choices[0]?.delta?.tool_calls || [])
      .filter(t => t.function?.arguments && !t.function.name).map(t => t.function.arguments).join('');
    assert.equal(args, '{"command":"ls"}');

    const final = chunks.at(-1);
    assert.equal(final.choices[0].finish_reason, 'tool_calls');
    assert.deepEqual(final.usage, { prompt_tokens: 40, completion_tokens: 7, prompt_tokens_details: { cached_tokens: 12 } });
  } finally {
    await closeServer(fx.server);
  }
});

test('responses incomplete maps max_output_tokens to length, other reasons to stop + note (AC-25)', async () => {
  const mk = async (reason) => fixtureServer({
    0: await sseResponder([
      { type: 'response.output_text.delta', item_id: 'm', output_index: 0, content_index: 0, delta: 'x' },
      { type: 'response.incomplete', response: { status: 'incomplete', incomplete_details: { reason }, usage: { input_tokens: 1, output_tokens: 2 } } },
    ]),
  });

  const fx1 = await mk('max_output_tokens');
  try {
    const chunks = await collect(streamResponses({ def: { baseURL: fx1.baseURL, apiKey: '' }, model: 'm', messages: [] }));
    assert.equal(chunks.at(-1).choices[0].finish_reason, 'length');
  } finally { await closeServer(fx1.server); }

  const fx2 = await mk('content_filter');
  try {
    const { result: chunks, writes } = await captureStdout(() =>
      collect(streamResponses({ def: { baseURL: fx2.baseURL, apiKey: '' }, model: 'm', messages: [] })));
    assert.equal(chunks.at(-1).choices[0].finish_reason, 'stop');
    assert.ok(writes.some(w => w.includes('incomplete')));
  } finally { await closeServer(fx2.server); }
});

test('responses redirect refuses the credential hop (AC-26)', async () => {
  const target = await listenOn(0);
  let targetGotAuth = false;
  target.on('request', (req, res) => { targetGotAuth = !!req.headers.authorization; res.writeHead(200).end('{}'); });
  const fx = await fixtureServer({
    0: (req, res) => { res.writeHead(301, { location: `http://127.0.0.1:${target.address().port}/x` }).end(); },
  });
  try {
    await assert.rejects(
      collect(streamResponses({ def: { baseURL: fx.baseURL, apiKey: 'sk-secretkey123' }, model: 'm', messages: [] })),
      /refusing to send your key/,
    );
    await new Promise(r => setTimeout(r, 100));
    assert.equal(targetGotAuth, false);
  } finally {
    await closeServer(fx.server);
    await closeServer(target);
  }
});

test('responses provider error event surfaces through the error path without retry (AC-27)', async () => {
  const fx = await fixtureServer({
    0: await sseResponder([
      { type: 'response.output_text.delta', item_id: 'm', output_index: 0, content_index: 0, delta: 'par' },
      { type: 'error', code: 'server_error', message: 'boom' },
    ]),
  });
  try {
    await assert.rejects(collect(streamResponses({ def: { baseURL: fx.baseURL, apiKey: '' }, model: 'm', messages: [] })), /boom/);
    assert.equal(fx.hits.length, 1);
  } finally { await closeServer(fx.server); }
});

// ──────────────────────────────────────────────────────────────
//  Non-streaming aggregation (compression/session-summary shape)
// ──────────────────────────────────────────────────────────────

test('fetch formats answer stream:false callers with an OpenAI-shaped message', async () => {
  const events = [
    { type: 'message_start', message: { usage: { input_tokens: 3 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'summary here' } },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 4 } },
    { type: 'message_stop' },
  ];
  const fx = await fixtureServer({ 0: await sseResponder(events) });
  try {
    const response = await requestAnthropicMessages({
      def: { baseURL: fx.baseURL, apiKey: '' }, model: 'claude-x', messages: MODEL_MESSAGES,
    });
    assert.equal(response.choices[0].message.content, 'summary here');
    assert.equal(response.choices[0].finish_reason, 'stop');
    assert.deepEqual(response.usage, { prompt_tokens: 3, completion_tokens: 4, prompt_tokens_details: { cached_tokens: 0 } });
  } finally {
    await closeServer(fx.server);
  }
});

// ──────────────────────────────────────────────────────────────
//  AC-29 — reasoningStyle body-key matrix (buildReasoningParams)
// ──────────────────────────────────────────────────────────────

const CUSTOM = 'my-llama'; // non-reserved slug => custom by construction

test('reasoningStyle matrix: each style emits exactly its documented body keys (AC-29)', () => {
  const base = { provider: CUSTOM, model: 'llama-x', effort: 'high' };

  assert.deepEqual(buildReasoningParams({ ...base, reasoningStyle: 'none' }), {});
  assert.deepEqual(buildReasoningParams({ ...base, reasoningStyle: 'reasoning_effort' }), { reasoning_effort: 'high' });
  assert.deepEqual(buildReasoningParams({ provider: CUSTOM, model: 'llama-x', effort: 'min', reasoningStyle: 'reasoning_effort' }), { reasoning_effort: 'low' });
  assert.deepEqual(buildReasoningParams({ ...base, reasoningStyle: 'reasoning' }), { reasoning: { effort: 'high' } });
  assert.deepEqual(buildReasoningParams({ provider: CUSTOM, model: 'llama-x', effort: 'min', reasoningStyle: 'reasoning' }), { reasoning: { effort: 'minimal' } });
  assert.deepEqual(buildReasoningParams({ provider: CUSTOM, model: 'llama-x', effort: 'low', reasoningStyle: 'thinking' }), { thinking: { type: 'enabled', budget_tokens: 1024 } });
  assert.deepEqual(buildReasoningParams({ ...base, reasoningStyle: 'enable_thinking' }), { enable_thinking: true });
  assert.deepEqual(buildReasoningParams({ ...base, reasoningStyle: 'chat_template_kwargs' }), { chat_template_kwargs: { enable_thinking: true } });
  assert.deepEqual(buildReasoningParams({ ...base, reasoningStyle: 'effort' }), { effort: 'high' });
  assert.deepEqual(buildReasoningParams({ ...base, reasoningStyle: 'reasoningEffort' }), { reasoningEffort: 'high' });
  assert.deepEqual(buildReasoningParams({ ...base, reasoningStyle: 'both' }), { reasoning_effort: 'high', enable_thinking: true });

  // effort 'none' with a style sends nothing.
  assert.deepEqual(buildReasoningParams({ provider: CUSTOM, model: 'llama-x', effort: 'none', reasoningStyle: 'chat_template_kwargs' }), {});

  // reasoning_effort UNSHORTED: sent even when the catalog marks the model
  // as non-reasoning (compare: the '' style with the same model stays gated
  // off by the catalog — the existing generic path behavior).
  assert.deepEqual(buildReasoningParams({ provider: CUSTOM, model: 'gpt-4o', effort: 'high', reasoningStyle: '' }), {});
  assert.deepEqual(buildReasoningParams({ provider: CUSTOM, model: 'gpt-4o', effort: 'high', reasoningStyle: 'reasoning_effort' }), { reasoning_effort: 'high' });
});

test('reasoningStyle never touches the reserved gateways (AC-29, F7)', () => {
  const withStyle = buildReasoningParams({ provider: 'openrouter', model: 'm', effort: 'high', reasoningStyle: 'chat_template_kwargs' });
  assert.deepEqual(withStyle, buildReasoningParams({ provider: 'openrouter', model: 'm', effort: 'high' }));
  assert.deepEqual(withStyle, { reasoning: { effort: 'high' } });
  const reqStyle = buildReasoningParams({ provider: 'requesty', model: 'openai/o3', effort: 'max', reasoningStyle: 'thinking' });
  assert.deepEqual(reqStyle, { reasoning_effort: 'high' });
});

// ──────────────────────────────────────────────────────────────
//  AC-31 — redaction
// ──────────────────────────────────────────────────────────────

test('formatApiError redacts bearer, key-assignment and sk-shaped secrets (AC-31)', () => {
  const err = new Error('upstream rejected Authorization: Bearer sk-or-realsecret123 api_key=sk-ant-realsecret456');
  const out = formatApiError(err, { model: 'm' });
  assert.ok(!out.includes('sk-or-realsecret123'));
  assert.ok(!out.includes('sk-ant-realsecret456'));
  assert.ok(!out.includes('realsecret'));
});

// ──────────────────────────────────────────────────────────────
//  End-to-end dispatch through client.js (temp-HOME subprocess)
// ──────────────────────────────────────────────────────────────

async function runSubprocess(testScript) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `emile-transport-${Date.now()}-`));
  const fakeHome = path.join(tmp, 'home');
  fs.mkdirSync(path.join(fakeHome, '.emile'), { recursive: true });

  const scriptPath = path.join(tmp, 'test.mjs');
  const stdoutPath = path.join(tmp, 'stdout.txt');
  const stderrPath = path.join(tmp, 'stderr.txt');
  fs.writeFileSync(scriptPath, testScript({ project: PROJECT_URL, fakeHome }));

  try {
    return await new Promise(resolve => {
      const stdoutFd = fs.openSync(stdoutPath, 'w');
      const stderrFd = fs.openSync(stderrPath, 'w');
      const child = spawn(process.execPath, [scriptPath], {
        cwd: tmp,
        env: {
          ...process.env,
          HOME: fakeHome,
          USERPROFILE: fakeHome,
          REQUESTY_API_KEY: '',
          OPENROUTER_API_KEY: '',
          OPENCODE_API_KEY: '',
        },
        stdio: ['ignore', stdoutFd, stderrFd],
      });
      fs.closeSync(stdoutFd);
      fs.closeSync(stderrFd);
      let spawnError = null;
      child.once('error', error => { spawnError = error; });
      child.once('close', code => {
        const stdout = fs.readFileSync(stdoutPath, 'utf8').trim();
        const stderr = fs.readFileSync(stderrPath, 'utf8').trim();
        if (spawnError) resolve({ ok: false, out: stdout, err: spawnError.message });
        else resolve(code === 0
          ? { ok: true, out: stdout }
          : { ok: false, out: stdout, err: `Node exited ${code}\n${stderr}` });
      });
    });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * Each end-to-end test below builds a self-contained script: it starts its
 * own fixture server on an ephemeral port, writes the v2 config pointing at
 * it, and only then imports config.js/client.js (singletons read the file at
 * import time), calls createChatCompletion and asserts the normalized stream.
 */
test('dispatch: custom anthropic-messages slot streams a normalized chunk set through client.js', async () => {
  const { ok, out, err } = await runSubprocess(({ project, fakeHome }) => `
import fs from 'node:fs';
import http from 'node:http';

const sse = (o) => 'event: ' + o.type + '\\ndata: ' + JSON.stringify(o) + '\\n\\n';
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  res.write(sse({ type: 'message_start', message: { usage: { input_tokens: 8, cache_read_input_tokens: 2 } } }));
  res.write(sse({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }));
  res.write(sse({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'turn ok' } }));
  res.write(sse({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } }));
  res.end();
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const baseURL = 'http://127.0.0.1:' + server.address().port + '/v1';

fs.mkdirSync(${JSON.stringify(path.join(fakeHome, '.emile'))}, { recursive: true });
fs.writeFileSync(${JSON.stringify(path.join(fakeHome, '.emile', 'config.json'))}, JSON.stringify({
  version: 2,
  activeProvider: 'fixture-anthropic',
  providers: { 'fixture-anthropic': { apiKey: 'k-fix', lastModel: 'claude-x', baseURL, format: 'anthropic-messages' } },
}));

const { createChatCompletion } = await import('${project}/src/api/index.js');
const stream = await createChatCompletion({ model: 'claude-x', messages: [{ role: 'system', content: 's' }, { role: 'user', content: 'hi' }], stream: true });
const chunks = [];
for await (const c of stream) chunks.push(c);
server.close();
const text = chunks.flatMap(c => c.choices?.[0]?.delta?.content || '').join('');
const last = chunks.at(-1);
if (text !== 'turn ok') { console.error('TEXT-MISMATCH ' + JSON.stringify(chunks)); process.exit(1); }
if (last?.choices?.[0]?.finish_reason !== 'stop') { console.error('FINISH-MISMATCH'); process.exit(1); }
if (last?.usage?.prompt_tokens !== 10 || last.usage.completion_tokens !== 3) { console.error('USAGE-MISMATCH ' + JSON.stringify(last?.usage)); process.exit(1); }
console.log('OK');
`);
  assert.equal(ok, true, err || out);
  assert.match(out, /OK/);
});

test('dispatch: custom responses slot with reasoningStyle-less effort flattens body and normalizes stream', async () => {
  const { ok, out, err } = await runSubprocess(({ project, fakeHome }) => `
import fs from 'node:fs';
import http from 'node:http';

let capturedBody = null;
const sse = (o) => 'event: ' + o.type + '\\ndata: ' + JSON.stringify(o) + '\\n\\n';
const server = http.createServer(async (req, res) => {
  let raw = ''; for await (const c of req) raw += c;
  capturedBody = JSON.parse(raw);
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  res.write(sse({ type: 'response.output_item.added', output_index: 0, item: { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'readFile', arguments: '' } }));
  res.write(sse({ type: 'response.function_call_arguments.delta', item_id: 'fc_1', output_index: 0, delta: '{"path":"x"}' }));
  res.write(sse({ type: 'response.completed', response: { status: 'completed', output: [{ type: 'function_call', call_id: 'call_1', name: 'readFile', arguments: '{"path":"x"}' }], usage: { input_tokens: 5, output_tokens: 6, input_tokens_details: { cached_tokens: 0 } } } }));
  res.end();
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const baseURL = 'http://127.0.0.1:' + server.address().port + '/v1';

fs.mkdirSync(${JSON.stringify(path.join(fakeHome, '.emile'))}, { recursive: true });
fs.writeFileSync(${JSON.stringify(path.join(fakeHome, '.emile', 'config.json'))}, JSON.stringify({
  version: 2,
  activeProvider: 'fixture-responses',
  providers: { 'fixture-responses': { apiKey: 'k-fix', lastModel: 'gpt-x', baseURL, format: 'responses' } },
}));

const { createChatCompletion } = await import('${project}/src/api/index.js');
const stream = await createChatCompletion({ model: 'gpt-x', messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: 'hi' }], tools: [{ type: 'function', function: { name: 'readFile', description: 'd', parameters: { type: 'object' } } }], effort: 'low', stream: true });
const chunks = [];
for await (const c of stream) chunks.push(c);
server.close();

const skeleton = chunks.find(c => c.choices?.[0]?.delta?.tool_calls?.[0]?.function?.name);
const last = chunks.at(-1);
const problems = [];
if (capturedBody?.instructions !== 'sys') problems.push('instructions missing');
if (capturedBody?.store !== false) problems.push('store not false');
if (!Array.isArray(capturedBody?.input)) problems.push('input missing');
if (JSON.stringify(capturedBody?.tools) !== '[{"type":"function","name":"readFile","description":"d","parameters":{"type":"object"}}]') problems.push('tools not flattened: ' + JSON.stringify(capturedBody?.tools));
if (!skeleton || skeleton.choices[0].delta.tool_calls[0].id !== 'call_1') problems.push('skeleton wrong');
if (last?.choices?.[0]?.finish_reason !== 'tool_calls') problems.push('finish not tool_calls');
if (last?.usage?.prompt_tokens !== 5 || last?.usage?.completion_tokens !== 6) problems.push('usage wrong');
if (problems.length) { console.error(problems.join(' | ')); process.exit(1); }
console.log('OK');
`);
  assert.equal(ok, true, err || out);
  assert.match(out, /OK/);
});

test('dispatch: reasoningStyle reaches the SDK body for a custom chat-completions slot', async () => {
  const { ok, out, err } = await runSubprocess(({ project, fakeHome }) => `
import fs from 'node:fs';
import http from 'node:http';

let capturedBody = null;
const sse = (o) => 'data: ' + JSON.stringify(o) + '\\n\\n';
const server = http.createServer(async (req, res) => {
  let raw = ''; for await (const c of req) raw += c;
  capturedBody = JSON.parse(raw);
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  res.write(sse({ choices: [{ index: 0, delta: { content: 'ok' } }] }));
  res.write(sse({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } }));
  res.write('data: [DONE]\\n\\n');
  res.end();
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const baseURL = 'http://127.0.0.1:' + server.address().port + '/v1';

fs.mkdirSync(${JSON.stringify(path.join(fakeHome, '.emile'))}, { recursive: true });
fs.writeFileSync(${JSON.stringify(path.join(fakeHome, '.emile', 'config.json'))}, JSON.stringify({
  version: 2,
  activeProvider: 'fixture-vllm',
  providers: { 'fixture-vllm': { apiKey: 'k', lastModel: 'qwen3', baseURL, format: 'chat-completions', reasoningStyle: 'chat_template_kwargs' } },
}));

const { createChatCompletion } = await import('${project}/src/api/index.js');
const stream = await createChatCompletion({ model: 'qwen3', messages: [{ role: 'user', content: 'hi' }], effort: 'high', stream: true });
for await (const c of stream) { /* consume */ }
server.close();

if (JSON.stringify(capturedBody?.chat_template_kwargs) !== '{"enable_thinking":true}') { console.error('STYLE-MISSING ' + JSON.stringify(capturedBody)); process.exit(1); }
if ('reasoning_effort' in capturedBody || 'reasoning' in capturedBody) { console.error('EXTRA-KEYS ' + JSON.stringify(capturedBody)); process.exit(1); }
console.log('OK');
`);
  assert.equal(ok, true, err || out);
  assert.match(out, /OK/);
});

test('dispatch: hand-edited remote http endpoint is refused before any socket', async () => {
  const { ok, out, err } = await runSubprocess(({ project, fakeHome }) => `
import fs from 'node:fs';
fs.mkdirSync(${JSON.stringify(path.join(fakeHome, '.emile'))}, { recursive: true });
fs.writeFileSync(${JSON.stringify(path.join(fakeHome, '.emile', 'config.json'))}, JSON.stringify({
  version: 2,
  activeProvider: 'evil',
  providers: { evil: { apiKey: 'k', lastModel: 'm', baseURL: 'http://evil.example.com/v1', format: 'anthropic-messages' } },
}));
const { createChatCompletion } = await import('${project}/src/api/index.js');
try {
  await createChatCompletion({ model: 'm', messages: [{ role: 'user', content: 'x' }], stream: true });
  console.error('NO-THROW'); process.exit(1);
} catch (e) {
  if (!/invalid endpoint URL/.test(e.message)) { console.error('MSG ' + e.message); process.exit(1); }
}
console.log('OK');
`);
  assert.equal(ok, true, err || out);
  assert.match(out, /OK/);
});
