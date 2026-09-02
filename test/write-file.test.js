import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { writeFile } from '../src/tools/handlers/write-file.js';
import { config } from '../src/config.js';
import { undoStack, clearFileCache } from '../src/tools/file-state.js';

test('rejects malformed writeFile arguments without creating a file or undo entry', async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'emile-write-'));
  const originalWorkspace = config.workspaceDir;
  try {
    config.workspaceDir = workspace;
    config.dryRun = false;
    clearFileCache();
    undoStack.splice(0, undoStack.length);

    assert.match(await writeFile({ path: '', content: 'x' }), /path must be a non-empty string/);
    assert.match(await writeFile({ path: 'new.txt', content: 123 }), /content must be a string/);
    assert.equal(fs.existsSync(path.join(workspace, 'new.txt')), false);
    assert.equal(undoStack.length, 0);
  } finally {
    config.workspaceDir = originalWorkspace;
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});
