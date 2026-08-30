// handlers/edit-file.js — editFile tool handler.
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { confirm, isCancel } from '@clack/prompts';
import { config } from '../../config.js';
import { resolveSafePath, isSafeCommand } from '../security.js';
import { fileCache, pushUndo } from '../file-state.js';
import { showDiff } from '../show-diff.js';

export async function editFile({ path: filePath, targetContent, replacementContent }) {
  try {
    const targetPath = resolveSafePath(filePath);
    if (!fs.existsSync(targetPath)) {
      return `Error: File not found at "${filePath}"`;
    }
    const oldContent = fs.readFileSync(targetPath, 'utf8');

    // IMPROVEMENTS.md §1.4: a target appearing more than once is ambiguous —
    // replacing the first occurrence silently edits the wrong place. Count
    // matches at every matching level and refuse to act on ambiguity.
    const countOccurrences = (haystack, needle) =>
      needle ? haystack.split(needle).length - 1 : 0;
    const ambiguousError = (level, count) =>
      `Error: Ambiguous match in "${filePath}" (matching level ${level}): targetContent appears ${count} times. Include more surrounding context to make it unique.`;

    if (!targetContent) {
      return `Error: targetContent must not be empty.`;
    }

    let updatedContent = null;

    // Level 1: Exact match
    let occurrences = countOccurrences(oldContent, targetContent);
    if (occurrences > 1) {
      return ambiguousError(1, occurrences);
    }
    if (occurrences === 1) {
      updatedContent = oldContent.replace(targetContent, replacementContent);
    } else {
      // Level 2: Line ending normalization (\r\n vs \n)
      const oldNorm = oldContent.replace(/\r\n/g, '\n');
      const targetNorm = targetContent.replace(/\r\n/g, '\n');
      occurrences = countOccurrences(oldNorm, targetNorm);
      if (occurrences > 1) {
        return ambiguousError(2, occurrences);
      }
      if (occurrences === 1) {
        updatedContent = oldNorm.replace(targetNorm, replacementContent.replace(/\r\n/g, '\n'));
      } else {
        // Level 3: Line-by-line comparison ignoring trailing whitespace per line
        const oldLines = oldNorm.split('\n');
        const targetLines = targetNorm.split('\n');

        let startIdx = -1;
        let matchCount = 0;
        for (let i = 0; i <= oldLines.length - targetLines.length; i++) {
          let match = true;
          for (let j = 0; j < targetLines.length; j++) {
            if (oldLines[i + j].trimEnd() !== targetLines[j].trimEnd()) {
              match = false;
              break;
            }
          }
          if (match) {
            if (startIdx === -1) startIdx = i;
            matchCount++;
          }
        }

        if (matchCount > 1) {
          return ambiguousError(3, matchCount);
        }
        if (startIdx !== -1) {
          const before = oldLines.slice(0, startIdx);
          const after = oldLines.slice(startIdx + targetLines.length);
          const replLines = replacementContent.replace(/\r\n/g, '\n').split('\n');
          updatedContent = [...before, ...replLines, ...after].join('\n');
        }
      }
    }

    if (updatedContent === null) {
      return `Error: Could not find targetContent in "${filePath}". Ensure whitespace and target code block match target file.`;
    }

    // Invalidate file cache
    fileCache.delete(targetPath);

    // Save previous state to undo stack (if not in dry-run mode)
    if (!config.dryRun) {
      pushUndo({ path: targetPath, content: oldContent });
    }

    // Handle Dry-Run simulation
    if (config.dryRun) {
      showDiff(filePath, oldContent, updatedContent);
      return `Successfully simulated editing "${filePath}" (DRY RUN - file not modified on disk)`;
    }

    fs.writeFileSync(targetPath, updatedContent, 'utf8');

    // Update cache with new content
    fileCache.set(targetPath, updatedContent);

    // Generate and display diff
    showDiff(filePath, oldContent, updatedContent);

    return `Successfully updated "${filePath}"`;
  } catch (err) {
    return `Error editing file: ${err.message}`;
  }
}
