// subprocess-env-scrub.test.js — the child of a runCommand call must never see
// provider credentials, secret-shaped variables, loader-injection vectors or
// EMILE_* config (specs/2026-10-09-subprocess-env-scrub, deep-dive P0-5 § 22.3).
//
// Two layers: `buildScrubbedEnv` is a pure function tested against a fixture,
// and the real gate is a genuine subprocess that dumps its own environment
// through the actual runCommand handler (real exec, real child, real PATH
// lookup) — the same safe-mode-off pattern as test/run-command.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildScrubbedEnv } from '../src/tools/security.js';
import { runCommand } from '../src/tools/handlers/run-command.js';
import { config } from '../src/config.js';

const SENTINEL = 'SENTINEL-OPENROUTER-KEY-MUST-NOT-LEAK';

/** Runs `command` through the real handler in an isolated temp workspace. */
async function withExecutionSandbox(t, run) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'emile-env-scrub-'));
  const original = {
    workspaceDir: config.workspaceDir,
    sessionCwd: config.sessionCwd,
    safeMode: config.safeMode,
    dryRun: config.dryRun,
    commandTimeout: config.commandTimeout,
  };
  t.after(() => {
    config.workspaceDir = original.workspaceDir;
    config.sessionCwd = original.sessionCwd;
    config.safeMode = original.safeMode;
    config.dryRun = original.dryRun;
    config.commandTimeout = original.commandTimeout;
    fs.rmSync(workspace, { recursive: true, force: true });
  });
  config.workspaceDir = workspace;
  config.sessionCwd = workspace;
  config.safeMode = false; // the gate under test is the env, not the confirmation
  config.dryRun = false;
  config.commandTimeout = 15000;
  return run(workspace);
}

// ── Unit: the deny-list itself ───────────────────────────────────────────────

test('buildScrubbedEnv deletes every secret-shaped and loader variable', () => {
  const scrubbed = buildScrubbedEnv({
    PATH: '/usr/bin',
    OPENROUTER_API_KEY: 'k1',
    Requesty_Api_KEY: 'k2', // Windows: name case is irrelevant (F3)
    GH_TOKEN: 't',
    GITLAB_PAT: 'p',
    LD_PRELOAD: 'evil',
    DYLD_INSERT_LIBRARIES: 'evil',
    AWS_SECRET_ACCESS_KEY: 's',
    DB_PASSWORD: 'pw',
    MY_PASSWD: 'pw',
    STRIPE_CREDENTIAL: 'c',
    MYAPP_COLOR: 'ok',
  });

  assert.deepEqual(Object.keys(scrubbed), ['PATH', 'MYAPP_COLOR'], 'only non-matching names survive');
  assert.equal(scrubbed.MYAPP_COLOR, 'ok', 'a kept variable keeps its value');
});

test('buildScrubbedEnv keeps the variables a real build needs', () => {
  const mustSurvive = [
    'PATH', 'Path', 'PATHEXT', 'SYSTEMROOT', 'COMSPEC', 'TEMP', 'TMP', 'TMPDIR',
    'HOME', 'USERPROFILE', 'USER', 'USERNAME', 'LANG', 'LC_ALL', 'SHELL', 'TERM',
    'JAVA_HOME', 'ANDROID_SDK_ROOT', 'NUMBER_OF_PROCESSORS', 'NODE_ENV', 'CI',
  ];
  const base = Object.fromEntries(mustSurvive.map((name) => [name, `value-of-${name}`]));
  const scrubbed = buildScrubbedEnv(base);

  // The brief's AC list plus the toolchain names an allowlist would forget:
  // none of them may be dropped, or arbitrary builds break (F6).
  for (const name of mustSurvive) {
    assert.equal(scrubbed[name], base[name], `${name} must survive the scrub`);
  }
});

test('buildScrubbedEnv never mutates the environment it was given', () => {
  const base = { OPENROUTER_API_KEY: SENTINEL, PATH: '/usr/bin' };
  const scrubbed = buildScrubbedEnv(base);

  assert.equal(scrubbed.OPENROUTER_API_KEY, undefined, 'the copy is scrubbed');
  assert.equal(base.OPENROUTER_API_KEY, SENTINEL, 'the source object is untouched — emile keeps its own env (F2)');
});

test('buildScrubbedEnv takes the environment to scrub, not a live process read', () => {
  // AC-06: no config, flag or env var can narrow the deny-list.
  assert.equal(buildScrubbedEnv.length, 0, 'one optional parameter, nothing else to inject policy through');
  assert.equal(buildScrubbedEnv({ MY_TOKEN: 'x' }).MY_TOKEN, undefined);
});

// ── Integration: a real child dumping its own environment ───────────────────

test('a tool-executed command cannot read provider credentials from its env', async (t) => {
  await withExecutionSandbox(t, async () => {
    const original = {
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
      REQUESTY_API_KEY: process.env.REQUESTY_API_KEY,
      EMILE_TEST_SCRUB_DEBUG: process.env.EMILE_TEST_SCRUB_DEBUG,
      LD_PRELOAD: process.env.LD_PRELOAD,
      DYLD_INSERT_LIBRARIES: process.env.DYLD_INSERT_LIBRARIES,
      MYAPP_COLOR: process.env.MYAPP_COLOR,
    };
    process.env.OPENROUTER_API_KEY = SENTINEL;
    process.env.REQUESTY_API_KEY = 'sentinel-requesty-key';
    process.env.EMILE_TEST_SCRUB_DEBUG = 'parent-only';
    process.env.LD_PRELOAD = 'libinject.so';
    process.env.DYLD_INSERT_LIBRARIES = 'libinject.dylib';
    process.env.MYAPP_COLOR = 'scrub-probe-survivor';

    // Real handler → real exec() → real cmd/sh → real node child printing the
    // environment it was actually given. PATH lookups here also prove the
    // deny-list did not remove what cmd/sh/node need to start.
    try {
      const result = await runCommand({
        command: 'node -p "JSON.stringify(process.env)"',
      });

      assert.ok(!result.includes(SENTINEL), 'the credential VALUE must not reach the child');
      assert.ok(!result.includes('sentinel-requesty-key'), 'every provider key stays with emile');
      assert.ok(!/"OPENROUTER_API_KEY"/i.test(result), 'the credential NAME must not reach the child');
      assert.ok(!/"REQUESTY_API_KEY"/i.test(result));
      assert.ok(!/"EMILE_TEST_SCRUB_DEBUG"/i.test(result), 'EMILE_* is dropped too');
      assert.ok(!/"LD_PRELOAD"/i.test(result), 'loader-injection vectors are dropped (AC-05)');
      assert.ok(!/"DYLD_INSERT_LIBRARIES"/i.test(result), 'macOS dyld injection is dropped (AC-05)');

      // AC-02: deny-by-pattern must not empty the environment.
      assert.match(result, /"PATH"|"Path"|"path"/, 'PATH survives — the child still resolves programs');
      assert.ok(/"scrub-probe-survivor"/.test(result), 'an unrelated variable survives unchanged');
      assert.ok(!/Command failed/.test(result), 'the env dump itself ran successfully');
    } finally {
      for (const [name, value] of Object.entries(original)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });
});

test('emile keeps its own environment after a scrubbed execution', async (t) => {
  await withExecutionSandbox(t, async () => {
    const had = 'OPENROUTER_API_KEY' in process.env;
    process.env.OPENROUTER_API_KEY = SENTINEL;
    try {
      await runCommand({ command: 'node -p "1"' });
      // F2/RF-S06: only the CHILD is scrubbed — config.js still resolves keys.
      assert.equal(process.env.OPENROUTER_API_KEY, SENTINEL, 'the parent env is untouched');
    } finally {
      if (!had) delete process.env.OPENROUTER_API_KEY;
    }
  });
});

test('dropping EMILE_* does not break the cwd probe or exit-code handling', async (t) => {
  // The probe SETS EMILE_COMMAND_STATUS inside the child shell, so scrubbing
  // the parent's EMILE_* must be harmless (RF-S09).
  await withExecutionSandbox(t, async (workspace) => {
    process.env.EMILE_TEST_SCRUB_DEBUG = 'parent-only';
    try {
      const isWin = process.platform === 'win32';
      const made = await runCommand({ command: `${isWin ? 'mkdir' : 'mkdir -p'} scrubsite && cd scrubsite` });
      assert.match(made, /working directory: scrubsite/, 'cwd tracking still works');

      const failed = await runCommand({ command: isWin ? 'cmd /c exit 7' : 'sh -c "exit 7"' });
      assert.match(failed, /Command failed with code 7/, 'exit codes still surface');
      assert.match(failed, /working directory: scrubsite/);
      assert.ok(fs.existsSync(path.join(workspace, 'scrubsite')));
    } finally {
      delete process.env.EMILE_TEST_SCRUB_DEBUG;
    }
  });
});
