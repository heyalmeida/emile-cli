// handlers/write-file.js — writeFile tool handler.
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { confirm, isCancel } from '@clack/prompts';
import { config } from '../../config.js';
import { resolveSafePath, isSafeCommand } from '../security.js';
import { fileCache, pushUndo } from '../file-state.js';
import { showDiff } from '../show-diff.js';

export async function writeFile({ path: filePath, content }) {
  try {
    const targetPath = resolveSafePath(filePath);
    const parentDir = path.dirname(targetPath);
    
    const oldContent = fs.existsSync(targetPath) 
      ? fs.readFileSync(targetPath, 'utf8') 
      : null;

    // Invalidate file cache
    fileCache.delete(targetPath);

    // Save previous state to undo stack (if not in dry-run mode)
    if (!config.dryRun) {
      pushUndo({ path: targetPath, content: oldContent });
    }

    // Handle Dry-Run simulation
    if (config.dryRun) {
      showDiff(filePath, oldContent, content);
      return `Successfully simulated writing to "${filePath}" (DRY RUN - file not modified on disk)`;
    }

    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    fs.writeFileSync(targetPath, content, 'utf8');

    // Update cache with new content
    fileCache.set(targetPath, content);

    // Generate and display diff
    showDiff(filePath, oldContent, content);

    return `Successfully wrote file to "${filePath}"`;
  } catch (err) {
    return `Error writing file: ${err.message}`;
  }
}
