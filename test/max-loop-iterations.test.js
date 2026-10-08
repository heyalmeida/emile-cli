// max-loop-iterations.test.js — single source of truth for the agent-loop cap
// (spec 2026-10-08-maxloop-divergence).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// config.js snapshots ~/.emile/config.json and the env at import time, so the
// "no saved config, no env var" world must be installed BEFORE the first
// import of src/config.js anywhere in this file. node --test runs each file
// in its own process, so a fresh module graph is guaranteed here.
const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'emile-maxloop-'));
const realHome = process.env.HOME;
const realUserProfile = process.env.USERPROFILE;
const savedEnvCap = process.env.EMILE_MAX_LOOP_ITERATIONS;
process.env.HOME = fakeHome;
process.env.USERPROFILE = fakeHome;
delete process.env.EMILE_MAX_LOOP_ITERATIONS;

const { config, DEFAULT_MAX_LOOP_ITERATIONS, readPositiveInt } = await import('../src/config.js');
const { runAgent } = await import('../src/agent/agent.js');
const { toolHandlers } = await import('../src/tools/index.js');

test.after(() => {
  if (realHome === undefined) delete process.env.HOME; else process.env.HOME = realHome;
  if (realUserProfile === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = realUserProfile;
  if (savedEnvCap === undefined) delete process.env.EMILE_MAX_LOOP_ITERATIONS; else process.env.EMILE_MAX_LOOP_ITERATIONS = savedEnvCap;
});

async function* toolCallStream() {
  yield {
    choices: [{
      delta: {
        tool_calls: [{
          index: 0,
          id: 'call_loop',
          function: { name: 'listDir', arguments: '{}' },
        }],
      },
    }],
  };
}

async function withMutedStdout(callback) {
  const originalWrite = process.stdout.write;
  process.stdout.write = () => true;
  try {
    return await callback();
  } finally {
    process.stdout.write = originalWrite;
  }
}

test('config.maxLoopIterations defaults to 90 with no saved config and no env var', () => {
  assert.equal(config.maxLoopIterations, 90);
});

test('DEFAULT_MAX_LOOP_ITERATIONS and readPositiveInt carry the same default', () => {
  assert.equal(DEFAULT_MAX_LOOP_ITERATIONS, 90);
  assert.equal(readPositiveInt(undefined, DEFAULT_MAX_LOOP_ITERATIONS), 90);
});

test('agent loop breaks after config.maxLoopIterations iterations instead of looping', async () => {
  const originalCap = config.maxLoopIterations;
  const originalListDir = toolHandlers.listDir;
  const calls = { completions: 0, tools: 0 };

  toolHandlers.listDir = async () => {
    calls.tools += 1;
    return { content: '[]', attachments: [] };
  };
  config.maxLoopIterations = 2;

  try {
    const messages = await withMutedStdout(() => runAgent({
      model: 'test/model',
      plansMode: false,
      skills: [],
      cache: false,
      effort: 'low',
      messages: [],
      initialPrompt: 'loop the tool forever',
      createCompletion: async () => {
        calls.completions += 1;
        return toolCallStream();
      },
    }));

    const toolMessages = messages.filter(m => m.role === 'tool');
    assert.equal(toolMessages.length, 2, 'each capped iteration produced one tool result');
    assert.equal(calls.completions, 2, 'the loop broke after 2 iterations instead of looping');
    assert.equal(calls.tools, 2);
  } finally {
    config.maxLoopIterations = originalCap;
    toolHandlers.listDir = originalListDir;
  }
});
