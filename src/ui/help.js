// help.js — ui/ module tree (extracted from the former src/ui.js monolith).
// See docs/architecture.md for the module map.
import { C, BOX_INDENT, getW, stripAnsi, wrapText, boxTopOpen, boxBottomOpen } from './theme.js';
import { buildHelpTable } from '../commands/registry.js';

const COL_ROOT = 14;
const COL_SUB = 14;
const COL_ARGS = 16;
const COL_DESC_MIN = 24;

function width() { return Math.min(getW(), 80); }

function visibleWidth(s) { return stripAnsi(s).length; }

function padRight(styled, width) {
  const v = visibleWidth(styled);
  if (v >= width) return styled;
  return styled + ' '.repeat(width - v);
}

function truncate(styled, max) {
  if (visibleWidth(styled) <= max) return styled;
  const plain = stripAnsi(styled);
  return plain.slice(0, Math.max(0, max - 1)) + '…';
}

export function printHelp() {
  const boxW = width();
  const descW = Math.max(COL_DESC_MIN, boxW - COL_ROOT - COL_SUB - COL_ARGS - 6);
  const rows = buildHelpTable();
  console.log();
  process.stdout.write(boxTopOpen('Commands', boxW) + '\n');

  // Header
  const header =
    BOX_INDENT
    + C.muted(padRight('Command', COL_ROOT))
    + C.muted(padRight('Subcommand', COL_SUB))
    + C.muted(padRight('Args', COL_ARGS))
    + C.muted('Description');
  process.stdout.write(header + '\n');
  const sep =
    BOX_INDENT
    + C.muted(padRight('─'.repeat(COL_ROOT - 1), COL_ROOT))
    + C.muted(padRight('─'.repeat(COL_SUB - 1), COL_SUB))
    + C.muted(padRight('─'.repeat(COL_ARGS - 1), COL_ARGS))
    + C.muted('─'.repeat(descW));
  process.stdout.write(sep + '\n');

  let lastRoot = null;
  for (const row of rows) {
    const isFirstOfGroup = row.root !== lastRoot;
    lastRoot = row.root;
    const rootCell = isFirstOfGroup
      ? C.bold(C.accent(padRight(row.root, COL_ROOT)))
      : C.muted(padRight('', COL_ROOT));
    const subCell = row.sub === '—'
      ? C.muted(padRight('—', COL_SUB))
      : C.info(padRight(row.sub, COL_SUB));
    const argsCell = row.args
      ? C.warn(padRight(row.args, COL_ARGS))
      : C.muted(padRight('—', COL_ARGS));
    const desc = wrapText(row.desc, descW);
    const descFirst = C.fg(truncate(desc[0] || '', descW));
    process.stdout.write(BOX_INDENT + rootCell + subCell + argsCell + descFirst + '\n');
    for (let i = 1; i < desc.length; i += 1) {
      const indent = ' '.repeat(COL_ROOT + COL_SUB + COL_ARGS);
      process.stdout.write(BOX_INDENT + indent + C.fg(truncate(desc[i], descW)) + '\n');
    }
  }
  process.stdout.write(boxBottomOpen(boxW) + '\n');
  console.log();
}
