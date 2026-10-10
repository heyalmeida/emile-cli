// history-sanitize.test.js — an assistant message with neither content nor
// tool_calls must never be created, persisted or resumed (specs/2026-10-09-
// assistant-null-poison, deep-dive P0-6).
//
// A dead stream used to push {role:'assistant', content:null}; persistence
// stripped the reasoning fields that were its only payload, and every later
// request resent that record until the provider answered
// `400 messages[i] needs content or tool_calls` — a permanent, non-retryable
// session kill (user-reported 2026-10-09, session-JSON evidence).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { config } from '../src/config.js';
import {
  isValidAssistantMessage,
  preparePersistedMessages,
  getSessionRecord,
  saveSession,
  deleteSession,
} from '../src/history.js';
import { runAgent } from '../src/agent/agent.js';

async function* streamOf(...deltas) {
  for (const delta of deltas) yield { choices: [{ delta }] };
}

/** A stream that yields the given deltas and then throws (dead provider). */
async function* streamThenThrow(deltas, message) {
  for (const delta of deltas) yield { choices: [{ delta }] };
  throw new Error(message);
}

// Session files live in the workspace `.emile/history/` (gitignored). Tests use
// unique ids and always delete them in a finally block — the same convention as
// test/session-resilience.test.js. `history.js` resolves its directory once at
// import time, so nothing here mutates config.workspaceDir.
const HISTORY_DIR = path.join(config.workspaceDir, '.emile', 'history');
const sessionFile = (id) => path.join(HISTORY_DIR, `${id}.json`);

function writeRawSession(id, record) {
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
  fs.writeFileSync(sessionFile(id), JSON.stringify(record, null, 2), 'utf8');
}

function captureOutput() {
  const writes = [];
  const originals = { out: process.stdout.write, err: process.stderr.write };
  process.stdout.write = (chunk) => { writes.push(String(chunk)); return true; };
  process.stderr.write = (chunk) => { writes.push(String(chunk)); return true; };
  return {
    text: () => writes.join(''),
    restore() {
      process.stdout.write = originals.out;
      process.stderr.write = originals.err;
    },
  };
}

/** Runs one turn with all terminal output muted; returns the live history. */
async function runMuted(options) {
  const capture = captureOutput();
  try {
    return await runAgent(options);
  } finally {
    capture.restore();
  }
}

/**
 * The provider-side rule that made the bug fatal: an assistant without content
 * AND without tool_calls is rejected with a non-retryable 400. Used as an
 * executable stand-in for the real gateway so the poison loop is proven closed.
 */
function assertWireValid(messages) {
  for (const [index, message] of messages.entries()) {
    if (!isValidAssistantMessage(message)) {
      throw Object.assign(new Error(`400 messages[${index}] needs content or tool_calls`), { status: 400 });
    }
  }
}

const invalidAssistants = (messages) =>
  messages.filter((message) => message?.role === 'assistant' && !isValidAssistantMessage(message));

const TOOL_CALL = { id: 'call_1', type: 'function', function: { name: 'listDir', arguments: '{}' } };

// ── AC-06: the predicate itself ──────────────────────────────────────────────

test('predicate: an assistant with no content and no tool_calls is invalid', () => {
  assert.equal(isValidAssistantMessage({ role: 'assistant', content: null }), false);
  assert.equal(isValidAssistantMessage({ role: 'assistant' }), false, 'undefined content is the same class');
  assert.equal(isValidAssistantMessage({ role: 'assistant', content: '' }), false, 'empty string is the same class');
  assert.equal(
    isValidAssistantMessage({ role: 'assistant', content: null, tool_calls: [] }),
    false,
    'an empty tool_calls array is as good as absent',
  );
  assert.equal(
    isValidAssistantMessage({ role: 'assistant', content: null, reasoning_content: 'private thought' }),
    false,
    'reasoning is stripped at persist, so a reasoning-only turn IS the poison shape',
  );
});

test('predicate: content:null WITH tool_calls stays valid (F7)', () => {
  assert.equal(isValidAssistantMessage({ role: 'assistant', content: null, tool_calls: [TOOL_CALL] }), true);
  assert.equal(isValidAssistantMessage({ role: 'assistant', content: '', tool_calls: [TOOL_CALL] }), true);
});

test('predicate: real content is valid, including structured content', () => {
  assert.equal(isValidAssistantMessage({ role: 'assistant', content: 'answer' }), true);
  assert.equal(
    isValidAssistantMessage({ role: 'assistant', content: [{ type: 'text', text: 'multimodal' }] }),
    true,
    'array content must never be mistaken for empty',
  );
});

test('predicate: non-assistant roles and junk entries are never judged here', () => {
  for (const message of [
    { role: 'user', content: null },
    { role: 'system', content: '' },
    { role: 'tool', tool_call_id: 'call_1', content: null },
    null,
    undefined,
    'garbage',
  ]) {
    assert.equal(isValidAssistantMessage(message), true, `must not reject ${JSON.stringify(message)}`);
  }
});

// ── AC-02 / AC-04: the persist boundary ──────────────────────────────────────

test('preparePersistedMessages drops the invalid assistant and keeps the valid one', () => {
  const messages = [
    { role: 'user', content: 'go' },
    { role: 'assistant', content: null, reasoning_content: 'thinking' }, // error/reasoning-only turn
    { role: 'assistant', content: null, tool_calls: [TOOL_CALL] },        // F7 shape, must survive
    { role: 'tool', tool_call_id: 'call_1', content: 'ok' },
    { role: 'assistant', content: 'done' },
  ];

  const persisted = preparePersistedMessages(messages);

  assert.deepEqual(invalidAssistants(persisted), [], 'no invalid assistant reaches disk');
  assert.equal(persisted.length, 4, 'only the empty assistant was dropped');
  assert.deepEqual(persisted[1].tool_calls, [TOOL_CALL], 'the tool_calls-shaped assistant is preserved');
  assert.equal(persisted[2].content, 'ok', 'its tool result still follows it');
  assert.equal(persisted[2].tool_call_id, 'call_1', 'pairing is intact');
  assert.equal(messages.length, 5, 'the live array was not mutated');
});

test('saveSession writes no invalid assistant even when handed one', (t) => {
  const sessionId = `test_persist_guard_${Date.now()}`;
  try {
    saveSession(sessionId, 'persist guard', [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: null, reasoning_content: 'secret reasoning' },
      { role: 'assistant', content: null, tool_calls: [TOOL_CALL] },
      { role: 'tool', tool_call_id: 'call_1', content: 'ok' },
    ], { status: 'complete' });

    const onDisk = JSON.parse(fs.readFileSync(sessionFile(sessionId), 'utf8'));
    assert.deepEqual(invalidAssistants(onDisk.messages), [], 'the file on disk holds no poison');
    assert.equal(onDisk.messages.length, 3);
    assert.equal(onDisk.messages[1].tool_calls[0].id, 'call_1', 'the checkpoint-shaped record survives');
  } finally {
    deleteSession(sessionId);
  }
  t.after(() => assert.equal(fs.existsSync(sessionFile(sessionId)), false));
});

// ── AC-03: the load boundary self-heals the user's exact file ────────────────

test('getSessionRecord self-heals the reported poison pattern on read', (t) => {
  const sessionId = `test_poisoned_${Date.now()}`;
  // Verbatim shape from the user's session JSON: the pair repeats because every
  // "Prossiga" answered the same 400 and appended another null turn.
  writeRawSession(sessionId, {
    id: sessionId,
    summary: 'Prossiga loop',
    createdAt: '2026-10-09T00:00:00.000Z',
    updatedAt: '2026-10-09T00:30:00.000Z',
    status: 'complete',
    messages: [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'continue the work' },
      { role: 'assistant', content: 'first answer' },
      { role: 'assistant', content: null },
      { role: 'user', content: 'Prossiga' },
      { role: 'assistant', content: null },
      { role: 'user', content: 'Prossiga' },
      { role: 'assistant', content: null },
      { role: 'user', content: 'Prossiga' },
    ],
  });
  const before = fs.readFileSync(sessionFile(sessionId), 'utf8');

  try {
    const record = getSessionRecord(sessionId);
    assert.ok(record, 'the session still loads');
    assert.deepEqual(invalidAssistants(record.messages), [], 'no invalid assistant survives the read');
    assert.equal(record.messages.length, 6, 'the 3 empty assistants dropped, nothing else');
    assert.deepEqual(
      record.messages.map((m) => `${m.role}:${m.content}`),
      [
        'system:sys',
        'user:continue the work',
        'assistant:first answer',
        'user:Prossiga',
        'user:Prossiga',
        'user:Prossiga',
      ],
      'order preserved and consecutive user messages are NOT merged (RF-S08)',
    );
    assert.equal(fs.readFileSync(sessionFile(sessionId), 'utf8'), before, 'load never rewrites the file in place');
  } finally {
    deleteSession(sessionId);
  }
});

test('load keeps the valid tool_calls-shaped assistant, its result and the checkpoint', (t) => {
  const sessionId = `test_toolcall_shape_${Date.now()}`;
  try {
    saveSession(sessionId, 'tools', [
      { role: 'user', content: 'list' },
      { role: 'assistant', content: null, tool_calls: [TOOL_CALL] },
      { role: 'tool', tool_call_id: 'call_1', content: 'a file' },
      { role: 'assistant', content: 'done' },
    ], { status: 'tool_pending', pendingToolCalls: [TOOL_CALL] });

    const record = getSessionRecord(sessionId);
    assert.equal(record.status, 'tool_pending', 'sanitizing does not disturb checkpoint state');
    assert.equal(record.pendingToolCalls.length, 1);
    assert.equal(record.messages.length, 4, 'nothing is dropped from a valid history');
    assert.equal(record.messages[1].content, null, 'content:null is preserved because tool_calls exist');
    assert.equal(record.messages[2].tool_call_id, 'call_1');
  } finally {
    deleteSession(sessionId);
  }
});

test('a record without a messages array keeps its original falsy shape', (t) => {
  // Regression guard: sanitizing must not turn a malformed/legacy file into an
  // empty-but-truthy history — cli.js treats a falsy load as "start new".
  const sessionId = `test_no_messages_${Date.now()}`;
  writeRawSession(sessionId, { id: sessionId, summary: 'legacy', status: 'complete' });
  try {
    const record = getSessionRecord(sessionId);
    assert.equal(record.messages, undefined, 'absent messages stays absent');
    assert.equal(record.status, 'complete');

    const emptyish = `test_emptyish_${Date.now()}`;
    writeRawSession(emptyish, { id: emptyish, messages: null, status: 'complete' });
    try {
      const nullRecord = getSessionRecord(emptyish);
      assert.equal(nullRecord.messages, null, 'a null messages field is not coerced to []');
    } finally {
      deleteSession(emptyish);
    }
  } finally {
    deleteSession(sessionId);
  }
});

// ── AC-01 / AC-02 / AC-07: the generation boundary + the poison loop ─────────

test('a zero-chunk stream error leaves no assistant message in live history', async () => {
  const messages = [];
  const capture = captureOutput();
  try {
    await runAgent({
      model: 'test/poison',
      plansMode: false,
      skills: [],
      cache: false,
      effort: 'low',
      messages,
      initialPrompt: 'Prossiga',
      createCompletion: async () => streamThenThrow([], 'socket closed unexpectedly'),
    });
  } finally {
    capture.restore();
  }

  const output = capture.text();
  assert.deepEqual(invalidAssistants(messages), [], 'nothing invalid was pushed');
  assert.equal(messages.filter((m) => m.role === 'assistant').length, 0, 'not even a valid empty assistant');
  assert.match(output, /Stream error/, 'the real error is still surfaced');
  assert.doesNotMatch(output, /empty response/, 'AC-05: no double notice once streamErrored is set');
});

test('a reasoning-only turn that errors leaves no record in live history or its projection', async () => {
  const messages = [];
  await runMuted({
    model: 'test/reasoning-poison',
    plansMode: false,
    skills: [],
    cache: false,
    effort: 'low',
    messages,
    initialPrompt: 'explain',
    createCompletion: async () => streamThenThrow(
      [
        { reasoning_content: 'Considering the request' },
        { reasoning_details: [{ type: 'reasoning.text', id: 'r1', text: 'Considering the request' }] },
      ],
      'stream ended before completion',
    ),
  });

  assert.deepEqual(invalidAssistants(messages), [], 'the live array holds no invalid assistant');
  assert.equal(messages.filter((m) => m.role === 'assistant').length, 0, 'no {content:null} record exists');
  assert.deepEqual(
    invalidAssistants(preparePersistedMessages(messages)),
    [],
    'the projection a persisting caller would write is clean too',
  );
});

test('the same session survives consecutive turns: no 400 poison loop', async () => {
  const messages = [];
  const base = { plansMode: false, skills: [], cache: false, effort: 'low', model: 'test/loop', messages };

  // Turn 1 — the provider dies mid-stream. This is exactly where the old code
  // pushed {content:null} and every later request started failing.
  await runMuted({
    ...base,
    initialPrompt: 'start',
    createCompletion: async ({ messages: sent }) => {
      assertWireValid(sent);
      return streamThenThrow([], 'connection reset');
    },
  });
  assert.deepEqual(invalidAssistants(messages), [], 'turn 1 left no poison');

  // Turn 2 — the user types "Prossiga". Rejected every time before the fix.
  await runMuted({
    ...base,
    initialPrompt: 'Prossiga',
    createCompletion: async ({ messages: sent }) => {
      assertWireValid(sent);
      return streamOf({ content: 'Resuming now.' });
    },
  });
  assert.match(messages.at(-1).content, /Resuming now/, 'turn 2 answered');

  // Turn 3 — the accumulated history is still accepted by the strict provider.
  await runMuted({
    ...base,
    initialPrompt: 'and again',
    createCompletion: async ({ messages: sent }) => {
      assertWireValid(sent);
      return streamOf({ content: 'Still healthy.' });
    },
  });
  assert.match(messages.at(-1).content, /Still healthy/);

  assert.equal(messages.filter((m) => m.role === 'assistant').length, 2, 'the errored turn added none');
  assert.equal(messages.filter((m) => m.role === 'user').length, 3, 'every user turn is still there');
});

test('a poisoned session resumes clean and completes its next turn', (t) => {
  const sessionId = `test_resume_${Date.now()}`;
  writeRawSession(sessionId, {
    id: sessionId,
    summary: 'dead stream',
    createdAt: '2026-10-09T00:00:00.000Z',
    updatedAt: '2026-10-09T00:05:00.000Z',
    status: 'complete',
    messages: [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'do the thing' },
      { role: 'assistant', content: null },
      { role: 'user', content: 'Prossiga' },
      { role: 'assistant', content: null },
    ],
  });

  return (async () => {
    try {
      const resumed = getSessionRecord(sessionId).messages;
      assert.deepEqual(invalidAssistants(resumed), [], 'resumed history is clean');

      let rejected = false;
      const returned = await runMuted({
        model: 'test/resume',
        plansMode: false,
        skills: [],
        cache: false,
        effort: 'low',
        messages: resumed,
        initialPrompt: 'Prossiga',
        createCompletion: async ({ messages: sent }) => {
          try {
            assertWireValid(sent);
          } catch {
            rejected = true;
            throw new Error('400 messages[i] needs content or tool_calls');
          }
          return streamOf({ content: 'Back on track.' });
        },
      });

      assert.equal(rejected, false, 'the request the provider used to reject never happened');
      assert.match(returned.at(-1).content, /Back on track/, 'the session is usable again');
    } finally {
      deleteSession(sessionId);
    }
  })();
});

test('tool_calls-only turns still reach history with their results paired', async () => {
  const messages = [];
  let calls = 0;
  await runMuted({
    model: 'test/tools',
    plansMode: false,
    skills: [],
    cache: false,
    effort: 'low',
    messages,
    initialPrompt: 'list files',
    // First response: a tool-only assistant (content:null + tool_calls) — the
    // valid F7 shape. Second: plain text, so the loop terminates.
    createCompletion: async () => {
      calls += 1;
      return calls === 1
        ? streamOf({ tool_calls: [{ index: 0, id: 'call_a', function: { name: 'readFile', arguments: '{}' } }] })
        : streamOf({ content: 'Read it.' });
    },
  });

  assert.equal(calls, 2, 'the tool batch ran and the turn finished normally');
  const assistant = messages.find((m) => m.role === 'assistant');
  assert.ok(assistant, 'the assistant carrying tool_calls was kept');
  assert.equal(assistant.content, null, 'content:null is preserved for a tool-only turn');
  assert.equal(assistant.tool_calls[0].function.name, 'readFile');
  assert.equal(messages.filter((m) => m.role === 'tool').length, 1, 'its result follows');
  assert.equal(messages.at(-2).tool_call_id, 'call_a', 'pairing intact');
});

test('a cancel that arrived before any text adds no assistant message', async () => {
  // The cancel path had the same hole: a stop after reasoning-only deltas
  // reached the `else` branch and pushed {content:null} as a "partial response".
  const control = (await import('../src/agent/turn-control.js')).createTurnControl();

  async function* reasonThenCancel() {
    yield { choices: [{ delta: { reasoning_content: 'thinking' } }] };
    control.requestStop('interrupt');
    yield { choices: [{ delta: { content: 'never consumed' } }] };
  }

  const messages = [];
  const capture = captureOutput();
  try {
    await runAgent({
      model: 'test/cancel-poison',
      plansMode: false,
      skills: [],
      cache: false,
      effort: 'low',
      messages,
      initialPrompt: 'explain',
      control,
      createCompletion: async () => reasonThenCancel(),
    });
  } finally {
    capture.restore();
  }

  assert.deepEqual(invalidAssistants(messages), [], 'no empty assistant from the cancel path');
  assert.equal(messages.filter((m) => m.role === 'assistant').length, 0, 'nothing was invented');
  assert.match(capture.text(), /Turn canceled/, 'the cancel notice is unchanged');
});

test('a cancel that arrived with real text keeps that partial response', async () => {
  // AC-08: the guard must not change the documented cancel semantics.
  const control = (await import('../src/agent/turn-control.js')).createTurnControl();

  async function* textThenCancel() {
    yield { choices: [{ delta: { content: 'kept ' } }] };
    control.requestStop('interrupt');
    yield { choices: [{ delta: { content: 'discarded' } }] };
  }

  const messages = [];
  await runMuted({
    model: 'test/cancel-partial',
    plansMode: false,
    skills: [],
    cache: false,
    effort: 'low',
    messages,
    initialPrompt: 'write',
    control,
    createCompletion: async () => textThenCancel(),
  });

  assert.equal(messages.at(-1).role, 'assistant');
  assert.equal(messages.at(-1).content, 'kept ', 'partial text is still retained');
});

test('a genuinely empty stream still prints the empty-response notice', async () => {
  // The dead-flag fix must not swallow the notice for the case it was written
  // for (test/empty-stream-line.test.js pins the same behavior).
  const capture = captureOutput();
  try {
    await runAgent({
      model: 'test/empty',
      plansMode: false,
      skills: [],
      cache: false,
      effort: 'low',
      messages: [],
      initialPrompt: 'Hi',
      createCompletion: async () => streamOf(),
    });
  } finally {
    capture.restore();
  }
  assert.match(capture.text(), /empty response/, 'the notice survives when no error occurred');
});
