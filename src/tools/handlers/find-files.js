// handlers/find-files.js — findFiles tool handler.
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { confirm, isCancel } from '@clack/prompts';
import { config } from '../../config.js';
import { resolveSafePath, isSafeCommand } from '../security.js';
import { fileCache, undoStack } from '../file-state.js';
import { showDiff } from '../show-diff.js';

export async function findFiles({ pattern, dir = '.' }) {
  try {
    const startPath = resolveSafePath(dir);
    if (!fs.existsSync(startPath)) return `Error: Directory "${dir}" not found.`;

    const results = [];
    const ignore = ['node_modules', '.git', '.emile', 'dist', 'build', '.next', 'coverage'];
    const cleanPattern = pattern.toLowerCase().replace(/\*/g, '');

    function searchDir(currentDir, depth = 0) {
      if (depth > 5 || results.length >= 50) return;
      try {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          if (ignore.includes(entry.name)) continue;
          const fullPath = path.join(currentDir, entry.name);
          const relPath = path.relative(config.workspaceDir, fullPath);

          if (entry.name.toLowerCase().includes(cleanPattern) || relPath.toLowerCase().includes(cleanPattern)) {
            results.push(`${entry.isDirectory() ? '[DIR]' : '[FILE]'} ${relPath}`);
          }

          if (entry.isDirectory()) {
            searchDir(fullPath, depth + 1);
          }
        }
      } catch { /* ignore */ }
    }

    searchDir(startPath);

    if (results.length === 0) {
      return `No files or directories matching "${pattern}" were found.`;
    }

    return `Found ${results.length} item(s) matching "${pattern}":\n${results.join('\n')}`;
  } catch (err) {
    return `Error finding files: ${err.message}`;
  }
}
