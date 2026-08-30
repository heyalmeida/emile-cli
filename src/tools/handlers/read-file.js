// handlers/read-file.js — readFile tool handler.
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { confirm, isCancel } from '@clack/prompts';
import { config } from '../../config.js';
import { resolveSafePath, isSafeCommand } from '../security.js';
import { fileCache, undoStack } from '../file-state.js';
import { showDiff } from '../show-diff.js';

export async function readFile({ path: filePath, startLine, endLine }) {
  try {
    const targetPath = resolveSafePath(filePath);
    
    let content;
    if (fileCache.has(targetPath)) {
      content = fileCache.get(targetPath);
    } else {
      if (!fs.existsSync(targetPath)) {
        return `Error: File not found at "${filePath}"`;
      }
      const stat = fs.statSync(targetPath);
      if (!stat.isFile()) {
        return `Error: Path "${filePath}" is a directory, not a file.`;
      }
      content = fs.readFileSync(targetPath, 'utf8');
      fileCache.set(targetPath, content);
    }

    if (startLine || endLine) {
      const lines = content.split('\n');
      const start = Math.max(1, startLine || 1);
      const end = Math.min(lines.length, endLine || lines.length);
      const sliced = lines.slice(start - 1, end);
      const formatted = sliced.map((line, idx) => `${start + idx}: ${line}`).join('\n');
      return `[Lines ${start}-${end} of ${lines.length} in ${filePath}]\n${formatted}`;
    }

    // Universal context cap: any model gets at most MAX_READ_LINES per
    // uncapped read, with an explicit notice telling the model how to read
    // the rest (a 50k-line file entering the context wholesale can blow
    // the window by surprise).
    const MAX_READ_LINES = 2000;
    const lines = content.split('\n');
    if (lines.length > MAX_READ_LINES) {
      const capped = lines.slice(0, MAX_READ_LINES).join('\n');
      return `[${filePath} — showing first ${MAX_READ_LINES} of ${lines.length} lines (context cap). Use startLine/endLine to read specific ranges.]\n${capped}`;
    }

    return content;
  } catch (err) {
    return `Error reading file: ${err.message}`;
  }
}
