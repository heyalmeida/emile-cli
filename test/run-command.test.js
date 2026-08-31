import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runCommand } from '../src/tools/handlers/run-command.js';
import { config } from '../src/config.js';

test('persists a workspace-contained cwd between runCommand calls', async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'emile-cwd-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'emile-cwd-out-'));
  const original = {
    workspaceDir: config.workspaceDir,
    sessionCwd: config.sessionCwd,
    safeMode: config.safeMode,
    dryRun: config.dryRun,
    commandTimeout: config.commandTimeout,
  };

  try {
    config.workspaceDir = workspace;
    config.sessionCwd = workspace;
    config.safeMode = false;
    config.dryRun = false;
    config.commandTimeout = 5000;

    const first = await runCommand({ command: 'mkdir -p site && cd site' });
    assert.match(first, /working directory: site/);
    assert.equal(config.sessionCwd, path.join(workspace, 'site'));
    assert.doesNotMatch(first, /__EMILE_CWD_/);

    const second = await runCommand({ command: 'pwd' });
    assert.match(second, new RegExp(path.join(workspace, 'site').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

    await runCommand({ command: `cd ${outside}` });
    assert.equal(config.sessionCwd, path.join(workspace, 'site'));

    const failed = await runCommand({ command: 'false' });
    assert.match(failed, /Command failed with code 1/);
    assert.match(failed, /working directory: site/);
  } finally {
    config.workspaceDir = original.workspaceDir;
    config.sessionCwd = original.sessionCwd;
    config.safeMode = original.safeMode;
    config.dryRun = original.dryRun;
    config.commandTimeout = original.commandTimeout;
    fs.rmSync(workspace, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('dry-run does not change the session cwd', async () => {
  const original = { sessionCwd: config.sessionCwd, dryRun: config.dryRun };
  try {
    config.sessionCwd = config.workspaceDir;
    config.dryRun = true;
    const result = await runCommand({ command: 'cd child' });
    assert.match(result, /dry-run mode/);
    assert.equal(config.sessionCwd, config.workspaceDir);
  } finally {
    config.sessionCwd = original.sessionCwd;
    config.dryRun = original.dryRun;
  }
});
