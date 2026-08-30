// handlers/grep-search.js — grepSearch tool handler.
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { confirm, isCancel } from '@clack/prompts';
import { config } from '../../config.js';
import { resolveSafePath, isSafeCommand } from '../security.js';
import { fileCache, undoStack } from '../file-state.js';
import { showDiff } from '../show-diff.js';

export async function grepSearch({ query, dir = '.', isRegex = false }) {
  try {
    const startPath = resolveSafePath(dir);
    if (!fs.existsSync(startPath)) return `Error: Directory "${dir}" not found.`;

    const matches = [];
    const ignore = ['node_modules', '.git', '.emile', 'dist', 'build', '.next', 'package-lock.json'];
    let regExp;
    try {
      regExp = isRegex ? new RegExp(query, 'g') : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    } catch (err) {
      return `Error: Invalid regex pattern: ${err.message}`;
    }

    function searchInDir(currentDir, depth = 0) {
      if (depth > 5 || matches.length >= 50) return;
      try {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          if (ignore.includes(entry.name)) continue;
          const fullPath = path.join(currentDir, entry.name);

          if (entry.isDirectory()) {
            searchInDir(fullPath, depth + 1);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (['.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.zip', '.tar', '.gz', '.mp4', '.mp3', '.woff', '.woff2', '.ttf', '.eot'].includes(ext)) {
              continue;
            }

            try {
              const content = fs.readFileSync(fullPath, 'utf8');
              const lines = content.split('\n');
              const relPath = path.relative(config.workspaceDir, fullPath);

              for (let i = 0; i < lines.length; i++) {
                if (matches.length >= 50) break;
                regExp.lastIndex = 0;
                if (regExp.test(lines[i])) {
                  matches.push(`${relPath}:${i + 1}: ${lines[i].trim()}`);
                }
              }
            } catch { /* skip */ }
          }
        }
      } catch { /* ignore */ }
    }

    searchInDir(startPath);

    if (matches.length === 0) {
      return `No matches found for "${query}".`;
    }

    return `Found ${matches.length} match(es) for "${query}":\n${matches.join('\n')}`;
  } catch (err) {
    return `Error in grepSearch: ${err.message}`;
  }
}
