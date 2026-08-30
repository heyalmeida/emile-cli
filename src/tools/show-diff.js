// show-diff.js — renders file diffs through the central UI.
import { diffLines } from 'diff';
import { printDiffBlock } from '../ui/index.js';

export function showDiff(filePath, oldContent, newContent) {
  const oldText = oldContent === null ? '' : oldContent;
  const changes = diffLines(oldText, newContent);
  printDiffBlock(filePath, changes);
}

// Map of tool definitions in OpenAI format
