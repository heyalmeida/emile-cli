import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { handleForget, handleMemory, handleRemember } from '../src/commands/memory.js';
import { listGlobalMemories, rememberGlobalMemory, setMemoryPaused } from '../src/memory/index.js';

function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'emile-memory-command-'));
  const workspaceDir = path.join(base, 'workspace');
  fs.mkdirSync(workspaceDir);
  t.after(() => {
    setMemoryPaused(false);
    fs.rmSync(base, { recursive: true, force: true });
  });
  return {
    base,
    root: path.join(base, 'user-state', 'memory', 'v1'),
    ctx: {
      config: { workspaceDir, dryRun: false },
      memoryRoot: path.join(base, 'user-state', 'memory', 'v1'),
      getSessionId: () => 'command-session',
    },
  };
}

async function withoutConsole(callback) {
  const originalLog = console.log;
  const originalWrite = process.stdout.write;
  const output = [];
  console.log = (...args) => { output.push(`${args.join(' ')}\n`); };
  process.stdout.write = value => { output.push(String(value)); return true; };
  try { await callback(); } finally {
    console.log = originalLog;
    process.stdout.write = originalWrite;
  }
  return output.join('');
}

test('/remember requires confirmation for sensitive text and cancellation writes nothing', async t => {
  const { ctx, root } = fixture(t);
  let prompts = 0;
  ctx.confirmMemoryAction = async () => { prompts += 1; return false; };

  await withoutConsole(() => handleRemember(ctx, ['My', 'medical', 'diagnosis', 'affects', 'scheduling.']));

  assert.equal(prompts, 1);
  assert.equal(fs.existsSync(root), false);
});

test('ambiguous /forget previews matches and cancellation preserves every record', async t => {
  const { ctx, root } = fixture(t);
  await rememberGlobalMemory('I prefer concise answers.', { root, sessionId: 'one' });
  await rememberGlobalMemory('I prefer concise code comments.', { root, sessionId: 'two' });
  let prompts = 0;
  ctx.confirmMemoryAction = async () => { prompts += 1; return false; };

  const output = await withoutConsole(() => handleForget(ctx, ['concise']));

  assert.equal(prompts, 1);
  assert.equal(listGlobalMemories('', { root }).records.length, 2);
  assert.match(output, /Memories to forget/);
  assert.match(output, /mem_[a-f0-9]{16}/);
});

test('/memory export is confirmed, workspace-confined, restrictive and excludes provenance', async t => {
  const { base, ctx, root } = fixture(t);
  await rememberGlobalMemory('I prefer concise answers.', { root, sessionId: 'private-session' });
  ctx.confirmMemoryAction = async () => true;

  await withoutConsole(() => handleMemory(ctx, ['export', 'memory.json']));

  const exported = path.join(ctx.config.workspaceDir, 'memory.json');
  const content = fs.readFileSync(exported, 'utf8');
  assert.match(content, /I prefer concise answers/);
  assert.doesNotMatch(content, /sourceSessionRef|evidenceSessionRefs|private-session/);
  if (process.platform !== 'win32') assert.equal(fs.statSync(exported).mode & 0o777, 0o600);

  await withoutConsole(() => handleMemory(ctx, ['export', '../outside.json']));
  assert.equal(fs.existsSync(path.join(base, 'outside.json')), false);
});

test('memory mutations honor dry-run and session-local pause', async t => {
  const { ctx, root } = fixture(t);
  ctx.config.dryRun = true;
  await withoutConsole(() => handleRemember(ctx, ['I', 'prefer', 'concise', 'answers.']));
  assert.equal(fs.existsSync(root), false);

  ctx.config.dryRun = false;
  await withoutConsole(() => handleMemory(ctx, ['pause']));
  await withoutConsole(() => handleRemember(ctx, ['I', 'prefer', 'concise', 'answers.']));
  assert.equal(fs.existsSync(root), false);
  await withoutConsole(() => handleMemory(ctx, ['resume']));
});
