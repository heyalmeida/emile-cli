// handlers/list-dir.js — listDir tool handler.
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { confirm, isCancel } from '@clack/prompts';
import { config } from '../../config.js';
import { resolveSafePath, isSafeCommand } from '../security.js';
import { fileCache, undoStack } from '../file-state.js';
import { showDiff } from '../show-diff.js';

export async function listDir({ path: dirPath = '.' } = {}) {
  try {
    const targetPath = resolveSafePath(dirPath);
    if (!fs.existsSync(targetPath)) {
      return `Error: Directory not found at "${dirPath}"`;
    }
    const stat = fs.statSync(targetPath);
    if (!stat.isDirectory()) {
      return `Error: Path "${dirPath}" is a file, not a directory.`;
    }
    const entries = fs.readdirSync(targetPath, { withFileTypes: true });
    const files = entries
      .map(entry => `${entry.isDirectory() ? '[DIR] ' : '[FILE]'} ${entry.name}`)
      .join('\n');
    return files || '(empty directory)';
  } catch (err) {
    return `Error listing directory: ${err.message}`;
  }
}
