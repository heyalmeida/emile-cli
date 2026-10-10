// diff-block.js — ui/ module tree (extracted from the former src/ui.js monolith).
// See docs/architecture.md for the module map.
import { C, ROLE, GAP, MAX_BOX_W, BOX_INDENT, getW, stripAnsi, wrapText, fmtK, boxTopOpen, boxBottomOpen } from './theme.js';
import { config } from '../config.js';
import { getModelInfo } from '../models.js';
import readline from 'node:readline';

// ──────────────────────────────────────────────
//  Diff Block
// ──────────────────────────────────────────────

export function printDiffBlock(filePath, changes) {
  const cols   = process.stdout.columns || 80;
  const boxW   = Math.max(cols - 4, 40);
  // Content width: 4-space indent + 4-char line number + space
  const PREFIX = BOX_INDENT.length + 5;
  const textW  = boxW - PREFIX;

  const fileLabel = ` ${filePath} `;
  const topFill = Math.max(boxW - fileLabel.length - 4, 0);

  // One diff row: `    NNNN + line` — colored number + marker + content,
  // truncated (never wrapped) to the box width. No right border.
  function diffRow(numStr, styledLine, rawLine) {
    const rawVis = stripAnsi(rawLine).length;
    const truncated = rawVis > textW ? rawLine.substring(0, textW - 1) + '…' : styledLine;
    return `${BOX_INDENT}${numStr} ${truncated}`;
  }

  // Open box top — file label between separately-styled muted parts
  console.log();
  process.stdout.write(`  ${ROLE.border.box('┌─')} ${C.bold(C.fg(fileLabel))} ${ROLE.border.box('─'.repeat(topFill))}\n`);

  let lineNum = 1;

  changes.forEach(part => {
    const lines = part.value.split('\n');
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();

    if (part.removed) {
      lines.forEach(line => {
        const num = ROLE.diff.delete(String(lineNum).padStart(4));
        process.stdout.write(diffRow(num, ROLE.diff.delete(`- ${line}`), `- ${line}`) + '\n');
        lineNum++;
      });
    } else if (part.added) {
      lines.forEach(line => {
        const num = ROLE.diff.insert(String(lineNum).padStart(4));
        process.stdout.write(diffRow(num, ROLE.diff.insert(`+ ${line}`), `+ ${line}`) + '\n');
        lineNum++;
      });
    } else {
      if (lines.length > 4) {
        for (let i = 0; i < 2; i++) {
          const num = ROLE.diff.context(String(lineNum).padStart(4));
          process.stdout.write(diffRow(num, ROLE.diff.context(`  ${lines[i]}`), `  ${lines[i]}`) + '\n');
          lineNum++;
        }
        const skipped = lines.length - 4;
        process.stdout.write(`${BOX_INDENT}     ${ROLE.meta.punct(`... ${skipped} lines ...`)}\n`);
        lineNum += skipped;
        for (let i = lines.length - 2; i < lines.length; i++) {
          const num = ROLE.diff.context(String(lineNum).padStart(4));
          process.stdout.write(diffRow(num, ROLE.diff.context(`  ${lines[i]}`), `  ${lines[i]}`) + '\n');
          lineNum++;
        }
      } else {
        lines.forEach(line => {
          const num = ROLE.diff.context(String(lineNum).padStart(4));
          process.stdout.write(diffRow(num, ROLE.diff.context(`  ${line}`), `  ${line}`) + '\n');
          lineNum++;
        });
      }
    }
  });

  process.stdout.write(`  ${ROLE.border.box('└' + '─'.repeat(Math.max(boxW - 1, 0)))}\n`);
}
